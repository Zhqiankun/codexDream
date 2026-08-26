#include <node_api.h>

#include <windows.h>
#include <bcrypt.h>
#include <winternl.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

extern "C" NTSYSAPI NTSTATUS NTAPI NtSetInformationFile(
    HANDLE file_handle,
    PIO_STATUS_BLOCK io_status_block,
    PVOID file_information,
    ULONG length,
    FILE_INFORMATION_CLASS file_information_class);

namespace {

constexpr NTSTATUS kStatusObjectNameNotFound = static_cast<NTSTATUS>(0xC0000034L);
constexpr NTSTATUS kStatusObjectPathNotFound = static_cast<NTSTATUS>(0xC000003AL);
constexpr NTSTATUS kStatusNoSuchFile = static_cast<NTSTATUS>(0xC000000FL);
constexpr NTSTATUS kStatusObjectNameCollision = static_cast<NTSTATUS>(0xC0000035L);
constexpr std::size_t kMaximumReadBytes = 64U * 1024U * 1024U;
constexpr ULONG kFileRenameInformation = 10U;

class StoreError final : public std::runtime_error {
 public:
  explicit StoreError(const std::string& reason)
      : std::runtime_error("STORE_TAMPERED:" + reason) {}
};

[[noreturn]] void Tampered(const char* reason) {
  throw StoreError(reason);
}

bool IsNotFound(NTSTATUS status) {
  return status == kStatusObjectNameNotFound ||
         status == kStatusObjectPathNotFound || status == kStatusNoSuchFile;
}

void CloseHandleSafely(HANDLE handle) {
  if (handle != nullptr && handle != INVALID_HANDLE_VALUE) CloseHandle(handle);
}

std::wstring ReadEnvironmentVariable(const wchar_t* name) {
  const DWORD required = GetEnvironmentVariableW(name, nullptr, 0);
  if (required == 0) Tampered("local-app-data");
  std::wstring result(required, L'\0');
  const DWORD written = GetEnvironmentVariableW(name, result.data(), required);
  if (written == 0 || written >= required) Tampered("local-app-data");
  result.resize(written);
  return result;
}

std::wstring NormalizePath(const std::wstring& input) {
  if (input.empty()) Tampered("root");
  const DWORD required = GetFullPathNameW(input.c_str(), 0, nullptr, nullptr);
  if (required == 0) Tampered("root");
  std::wstring result(required, L'\0');
  const DWORD written = GetFullPathNameW(
      input.c_str(), required, result.data(), nullptr);
  if (written == 0 || written >= required) Tampered("root");
  result.resize(written);
  while (result.size() > 3 &&
         (result.back() == L'\\' || result.back() == L'/')) {
    result.pop_back();
  }
  return result;
}

std::wstring JoinPath(const std::wstring& left, const std::wstring& right) {
  if (left.empty() || right.empty()) Tampered("root");
  return left + L"\\" + right;
}

bool EqualPath(const std::wstring& left, const std::wstring& right) {
  return _wcsicmp(left.c_str(), right.c_str()) == 0;
}

bool EqualAsciiInsensitive(const wchar_t* left, const wchar_t* right) {
  return _wcsicmp(left, right) == 0;
}

std::vector<std::wstring> SplitAbsolutePath(const std::wstring& path) {
  if (path.size() < 3 || path[1] != L':' || path[2] != L'\\') {
    Tampered("root");
  }
  std::vector<std::wstring> parts;
  std::size_t start = 3;
  while (start < path.size()) {
    const std::size_t end = path.find(L'\\', start);
    const std::size_t length =
        end == std::wstring::npos ? path.size() - start : end - start;
    if (length == 0) Tampered("root");
    const std::wstring part = path.substr(start, length);
    if (part == L"." || part == L".." || part.find(L'/') != std::wstring::npos ||
        part.find(L':') != std::wstring::npos) {
      Tampered("root");
    }
    parts.push_back(part);
    if (end == std::wstring::npos) break;
    start = end + 1;
  }
  return parts;
}

void ValidateFixedVolume(const std::wstring& absolute_path) {
  if (absolute_path.size() < 3 || absolute_path[1] != L':' ||
      absolute_path[2] != L'\\') {
    Tampered("volume");
  }
  const std::wstring drive = absolute_path.substr(0, 3);
  if (GetDriveTypeW(drive.c_str()) != DRIVE_FIXED) Tampered("volume");
  wchar_t file_system[64] = {};
  if (!GetVolumeInformationW(drive.c_str(), nullptr, 0, nullptr, nullptr,
                             nullptr, file_system,
                             static_cast<DWORD>(std::size(file_system)))) {
    Tampered("volume");
  }
  if (!EqualAsciiInsensitive(file_system, L"NTFS") &&
      !EqualAsciiInsensitive(file_system, L"ReFS")) {
    Tampered("volume");
  }
}

void CheckDirectoryHandle(HANDLE handle) {
  FILE_ATTRIBUTE_TAG_INFO info = {};
  if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &info,
                                    sizeof(info))) {
    Tampered("directory-info");
  }
  if ((info.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
      (info.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
    Tampered("directory-reparse");
  }
}

void CheckRegularFileHandle(HANDLE handle) {
  FILE_ATTRIBUTE_TAG_INFO info = {};
  if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &info,
                                    sizeof(info))) {
    Tampered("file-info");
  }
  if ((info.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0 ||
      (info.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
    Tampered("file-reparse");
  }
}

HANDLE OpenVolumeRoot(const std::wstring& drive) {
  HANDLE handle = CreateFileW(
      drive.c_str(), FILE_LIST_DIRECTORY | FILE_TRAVERSE | FILE_READ_ATTRIBUTES |
                         SYNCHRONIZE,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
      OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
      nullptr);
  if (handle == INVALID_HANDLE_VALUE) Tampered("volume-open");
  try {
    CheckDirectoryHandle(handle);
  } catch (...) {
    CloseHandleSafely(handle);
    throw;
  }
  return handle;
}

HANDLE OpenRelativeDirectory(HANDLE parent, const std::wstring& name,
                             bool create_if_missing) {
  UNICODE_STRING unicode_name = {};
  unicode_name.Buffer = const_cast<PWSTR>(name.c_str());
  unicode_name.Length = static_cast<USHORT>(name.size() * sizeof(wchar_t));
  unicode_name.MaximumLength = unicode_name.Length;
  OBJECT_ATTRIBUTES attributes = {};
  InitializeObjectAttributes(&attributes, &unicode_name, OBJ_CASE_INSENSITIVE,
                             parent, nullptr);
  IO_STATUS_BLOCK status_block = {};
  HANDLE handle = INVALID_HANDLE_VALUE;
  const ACCESS_MASK access = FILE_GENERIC_READ | FILE_TRAVERSE | SYNCHRONIZE;
  const ULONG options = FILE_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT |
                        FILE_OPEN_REPARSE_POINT;
  const NTSTATUS status = create_if_missing
                              ? NtCreateFile(
                                    &handle, access, &attributes, &status_block,
                                    nullptr, FILE_ATTRIBUTE_NORMAL,
                                    FILE_SHARE_READ | FILE_SHARE_WRITE |
                                        FILE_SHARE_DELETE,
                                    FILE_OPEN_IF, options, nullptr, 0)
                              : NtOpenFile(
                                    &handle, access, &attributes, &status_block,
                                    FILE_SHARE_READ | FILE_SHARE_WRITE |
                                        FILE_SHARE_DELETE,
                                    options);
  if (!NT_SUCCESS(status)) Tampered("directory-open");
  try {
    CheckDirectoryHandle(handle);
  } catch (...) {
    CloseHandleSafely(handle);
    throw;
  }
  return handle;
}

HANDLE OpenRelativeFile(HANDLE parent, const std::wstring& name,
                        ACCESS_MASK access, ULONG disposition,
                        bool* was_not_found = nullptr) {
  UNICODE_STRING unicode_name = {};
  unicode_name.Buffer = const_cast<PWSTR>(name.c_str());
  unicode_name.Length = static_cast<USHORT>(name.size() * sizeof(wchar_t));
  unicode_name.MaximumLength = unicode_name.Length;
  OBJECT_ATTRIBUTES attributes = {};
  InitializeObjectAttributes(&attributes, &unicode_name, OBJ_CASE_INSENSITIVE,
                             parent, nullptr);
  IO_STATUS_BLOCK status_block = {};
  HANDLE handle = INVALID_HANDLE_VALUE;
  const NTSTATUS status = NtCreateFile(
      &handle, access | FILE_READ_ATTRIBUTES | SYNCHRONIZE, &attributes,
      &status_block, nullptr,
      FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      disposition,
      FILE_NON_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT |
          FILE_OPEN_REPARSE_POINT,
      nullptr, 0);
  if (!NT_SUCCESS(status)) {
    if (was_not_found != nullptr && IsNotFound(status)) {
      *was_not_found = true;
      return INVALID_HANDLE_VALUE;
    }
    Tampered(disposition == FILE_CREATE ? "file-create" : "file-open");
  }
  try {
    CheckRegularFileHandle(handle);
  } catch (...) {
    CloseHandleSafely(handle);
    throw;
  }
  return handle;
}

void WriteAll(HANDLE handle, const std::vector<std::uint8_t>& data) {
  std::size_t offset = 0;
  while (offset < data.size()) {
    const DWORD chunk = static_cast<DWORD>(std::min<std::size_t>(
        data.size() - offset, static_cast<std::size_t>(MAXDWORD)));
    DWORD written = 0;
    if (!WriteFile(handle, data.data() + offset, chunk, &written, nullptr) ||
        written != chunk) {
      Tampered("write");
    }
    offset += written;
  }
  if (!FlushFileBuffers(handle)) Tampered("flush");
}

std::vector<std::uint8_t> ReadAll(HANDLE handle) {
  LARGE_INTEGER size = {};
  if (!GetFileSizeEx(handle, &size) || size.QuadPart < 0 ||
      static_cast<unsigned long long>(size.QuadPart) > kMaximumReadBytes) {
    Tampered("read-size");
  }
  std::vector<std::uint8_t> result(static_cast<std::size_t>(size.QuadPart));
  std::size_t offset = 0;
  while (offset < result.size()) {
    const DWORD chunk = static_cast<DWORD>(std::min<std::size_t>(
        result.size() - offset, static_cast<std::size_t>(MAXDWORD)));
    DWORD read = 0;
    if (!ReadFile(handle, result.data() + offset, chunk, &read, nullptr)) {
      Tampered("read");
    }
    if (read == 0) Tampered("read-short");
    offset += read;
  }
  return result;
}

struct RenameInformationBuffer {
  BOOLEAN replace_if_exists;
  HANDLE root_directory;
  ULONG file_name_length;
  wchar_t file_name[1];
};

void RenameRelative(HANDLE source, HANDLE parent, const std::wstring& target) {
  const std::size_t bytes = target.size() * sizeof(wchar_t);
  const std::size_t buffer_size =
      sizeof(RenameInformationBuffer) - sizeof(wchar_t) + bytes;
  std::vector<std::uint8_t> storage(buffer_size, 0);
  auto* rename = reinterpret_cast<RenameInformationBuffer*>(storage.data());
  rename->replace_if_exists = TRUE;
  rename->root_directory = parent;
  rename->file_name_length = static_cast<ULONG>(bytes);
  std::copy(target.begin(), target.end(), rename->file_name);
  IO_STATUS_BLOCK status_block = {};
  const NTSTATUS status = NtSetInformationFile(
      source, &status_block, rename, static_cast<ULONG>(storage.size()),
      static_cast<FILE_INFORMATION_CLASS>(kFileRenameInformation));
  if (!NT_SUCCESS(status)) Tampered("rename");
}

void DeleteByHandle(HANDLE file) {
  FILE_DISPOSITION_INFO disposition = {};
  disposition.DeleteFile = TRUE;
  if (!SetFileInformationByHandle(file, FileDispositionInfo, &disposition,
                                  sizeof(disposition))) {
    Tampered("delete");
  }
}

bool IsAllowedDirectory(const std::string& directory) {
  return directory == "state" || directory == "themes" ||
         directory == "transactions" || directory == "lock" ||
         directory == "ownership" || directory == "logs";
}

bool IsHex(wchar_t value) {
  return (value >= L'0' && value <= L'9') ||
         (value >= L'a' && value <= L'f') ||
         (value >= L'A' && value <= L'F');
}

bool IsThemeFile(const std::wstring& file_name) {
  const bool extension_ok =
      file_name.ends_with(L".png") || file_name.ends_with(L".jpg") ||
      file_name.ends_with(L".webp");
  const std::size_t suffix = file_name.ends_with(L".webp") ? 5U : 4U;
  if (!extension_ok || file_name.size() != 36U + suffix) return false;
  for (std::size_t index = 0; index < 36U; ++index) {
    if (index == 8U || index == 13U || index == 18U || index == 23U) {
      if (file_name[index] != L'-') return false;
    } else if (!IsHex(file_name[index])) {
      return false;
    }
  }
  return true;
}

void ValidateManagedFile(const std::string& directory,
                         const std::wstring& file_name) {
  if (!IsAllowedDirectory(directory) || file_name.empty() ||
      file_name.size() > 255U || file_name.find_first_of(L"\\/:\0") !=
                                     std::wstring::npos ||
      file_name == L"." || file_name == L".." || file_name.back() == L'.' ||
      file_name.back() == L' ') {
    Tampered("managed-path");
  }
  const bool valid =
      (directory == "state" && file_name == L"index.json") ||
      (directory == "transactions" &&
       (file_name == L"index.journal" || file_name == L"index.backup")) ||
      (directory == "lock" && file_name == L"store.lock") ||
      (directory == "ownership" && file_name == L"owned-session.json") ||
      (directory == "themes" && IsThemeFile(file_name));
  if (!valid) Tampered("managed-path");
}

class SecureStore final {
 public:
  explicit SecureStore(const std::wstring& requested_root) {
    const std::wstring local_app_data = NormalizePath(
        ReadEnvironmentVariable(L"LOCALAPPDATA"));
    const std::wstring expected_root =
        NormalizePath(JoinPath(local_app_data, L"CodexStyle"));
    if (!EqualPath(NormalizePath(requested_root), expected_root)) {
      Tampered("root");
    }
    ValidateFixedVolume(local_app_data);
    const std::wstring drive = local_app_data.substr(0, 3);
    HANDLE current = OpenVolumeRoot(drive);
    try {
      for (const std::wstring& segment : SplitAbsolutePath(local_app_data)) {
        HANDLE next = OpenRelativeDirectory(current, segment, false);
        CloseHandleSafely(current);
        current = next;
      }
      root_ = OpenRelativeDirectory(current, L"CodexStyle", true);
      CloseHandleSafely(current);
    } catch (...) {
      CloseHandleSafely(current);
      throw;
    }
  }

  ~SecureStore() { Close(); }

  SecureStore(const SecureStore&) = delete;
  SecureStore& operator=(const SecureStore&) = delete;

  void EnsureLayout() {
    EnsureOpen();
    for (const wchar_t* name : {L"state", L"themes", L"transactions", L"lock",
                                L"logs", L"ownership"}) {
      HANDLE directory = OpenRelativeDirectory(root_, name, true);
      CloseHandleSafely(directory);
    }
  }

  std::unique_ptr<std::vector<std::uint8_t>> Read(const std::string& directory,
                                                   const std::wstring& file_name) {
    ValidateManagedFile(directory, file_name);
    HANDLE parent = OpenParent(directory);
    bool not_found = false;
    HANDLE file = INVALID_HANDLE_VALUE;
    try {
      file = OpenRelativeFile(parent, file_name, FILE_GENERIC_READ, FILE_OPEN,
                              &not_found);
      CloseHandleSafely(parent);
      if (not_found) return nullptr;
      auto result = std::make_unique<std::vector<std::uint8_t>>(ReadAll(file));
      CloseHandleSafely(file);
      return result;
    } catch (...) {
      CloseHandleSafely(file);
      CloseHandleSafely(parent);
      throw;
    }
  }

  void WriteAtomic(const std::string& directory, const std::wstring& file_name,
                   const std::vector<std::uint8_t>& data) {
    ValidateManagedFile(directory, file_name);
    HANDLE parent = OpenParent(directory);
    HANDLE temporary = INVALID_HANDLE_VALUE;
    try {
      const std::wstring temporary_name = CreateTemporaryName();
      temporary = OpenRelativeFile(parent, temporary_name,
                                   FILE_GENERIC_WRITE | DELETE, FILE_CREATE);
      WriteAll(temporary, data);
      bool missing = false;
      HANDLE existing = OpenRelativeFile(parent, file_name, FILE_GENERIC_READ,
                                         FILE_OPEN, &missing);
      CloseHandleSafely(existing);
      RenameRelative(temporary, parent, file_name);
      CloseHandleSafely(temporary);
      CloseHandleSafely(parent);
    } catch (...) {
      if (temporary != INVALID_HANDLE_VALUE) {
        try {
          DeleteByHandle(temporary);
        } catch (...) {
        }
      }
      CloseHandleSafely(temporary);
      CloseHandleSafely(parent);
      throw;
    }
  }

  bool CreateExclusive(const std::string& directory,
                       const std::wstring& file_name,
                       const std::vector<std::uint8_t>& data) {
    ValidateManagedFile(directory, file_name);
    HANDLE parent = OpenParent(directory);
    HANDLE file = INVALID_HANDLE_VALUE;
    try {
      UNICODE_STRING unicode_name = {};
      unicode_name.Buffer = const_cast<PWSTR>(file_name.c_str());
      unicode_name.Length = static_cast<USHORT>(file_name.size() * sizeof(wchar_t));
      unicode_name.MaximumLength = unicode_name.Length;
      OBJECT_ATTRIBUTES attributes = {};
      InitializeObjectAttributes(&attributes, &unicode_name, OBJ_CASE_INSENSITIVE,
                                 parent, nullptr);
      IO_STATUS_BLOCK status_block = {};
      const NTSTATUS status = NtCreateFile(
          &file, FILE_GENERIC_WRITE | FILE_READ_ATTRIBUTES | DELETE |
                     SYNCHRONIZE,
          &attributes,
          &status_block, nullptr, FILE_ATTRIBUTE_NORMAL,
          FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, FILE_CREATE,
          FILE_NON_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT |
              FILE_OPEN_REPARSE_POINT,
          nullptr, 0);
      if (status == kStatusObjectNameCollision) {
        CloseHandleSafely(parent);
        return false;
      }
      if (!NT_SUCCESS(status)) Tampered("file-create");
      CheckRegularFileHandle(file);
      WriteAll(file, data);
      CloseHandleSafely(file);
      CloseHandleSafely(parent);
      return true;
    } catch (...) {
      if (file != INVALID_HANDLE_VALUE) {
        try {
          DeleteByHandle(file);
        } catch (...) {
        }
      }
      CloseHandleSafely(file);
      CloseHandleSafely(parent);
      throw;
    }
  }

  bool Remove(const std::string& directory, const std::wstring& file_name) {
    ValidateManagedFile(directory, file_name);
    HANDLE parent = OpenParent(directory);
    HANDLE file = INVALID_HANDLE_VALUE;
    try {
      bool not_found = false;
      file = OpenRelativeFile(parent, file_name, DELETE | FILE_READ_ATTRIBUTES,
                              FILE_OPEN, &not_found);
      CloseHandleSafely(parent);
      if (not_found) return false;
      DeleteByHandle(file);
      CloseHandleSafely(file);
      return true;
    } catch (...) {
      CloseHandleSafely(file);
      CloseHandleSafely(parent);
      throw;
    }
  }

  void Close() {
    if (root_ != INVALID_HANDLE_VALUE) CloseHandleSafely(root_);
    root_ = INVALID_HANDLE_VALUE;
  }

 private:
  HANDLE root_ = INVALID_HANDLE_VALUE;

  void EnsureOpen() const {
    if (root_ == INVALID_HANDLE_VALUE) Tampered("closed");
  }

  HANDLE OpenParent(const std::string& directory) {
    EnsureOpen();
    const std::wstring wide(directory.begin(), directory.end());
    return OpenRelativeDirectory(root_, wide, true);
  }

  std::wstring CreateTemporaryName() {
    std::array<UCHAR, 16> random = {};
    if (!BCRYPT_SUCCESS(BCryptGenRandom(nullptr, random.data(),
                                        static_cast<ULONG>(random.size()),
                                        BCRYPT_USE_SYSTEM_PREFERRED_RNG))) {
      Tampered("temporary-rng");
    }
    static constexpr wchar_t kHex[] = L"0123456789abcdef";
    std::wstring token;
    token.reserve(random.size() * 2U);
    for (const UCHAR byte : random) {
      token.push_back(kHex[byte >> 4U]);
      token.push_back(kHex[byte & 0x0fU]);
    }
    return L".codexstyle-tmp-" + token + L".tmp";
  }
};

std::wstring GetString(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf16(env, value, nullptr, 0, &length) != napi_ok) {
    Tampered("native-argument");
  }
  std::wstring result(length, L'\0');
  size_t written = 0;
  if (napi_get_value_string_utf16(
          env, value, reinterpret_cast<char16_t*>(result.data()), length + 1,
          &written) != napi_ok ||
      written != length) {
    Tampered("native-argument");
  }
  return result;
}

std::vector<std::uint8_t> GetBuffer(napi_env env, napi_value value) {
  void* data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok ||
      length > kMaximumReadBytes) {
    Tampered("native-buffer");
  }
  const auto* first = static_cast<const std::uint8_t*>(data);
  return std::vector<std::uint8_t>(first, first + length);
}

void Throw(napi_env env, const std::exception& error) {
  napi_throw_error(env, nullptr, error.what());
}

struct WrappedStore {
  SecureStore store;
  explicit WrappedStore(const std::wstring& root) : store(root) {}
};

napi_ref constructor_reference = nullptr;

void FinalizeStore(napi_env /*env*/, void* data, void* /*hint*/) {
  delete static_cast<WrappedStore*>(data);
}

WrappedStore* GetWrappedStore(napi_env env, napi_value this_value) {
  WrappedStore* result = nullptr;
  if (napi_unwrap(env, this_value, reinterpret_cast<void**>(&result)) != napi_ok ||
      result == nullptr) {
    Tampered("native-instance");
  }
  return result;
}

void GetDirectoryAndFile(napi_env env, napi_value* arguments,
                         std::string* directory, std::wstring* file_name) {
  const std::wstring wide_directory = GetString(env, arguments[0]);
  if (wide_directory.empty() || wide_directory.size() > 32U ||
      !std::all_of(wide_directory.begin(), wide_directory.end(), [](wchar_t c) {
        return c >= L'a' && c <= L'z';
      })) {
    Tampered("managed-path");
  }
  *directory = std::string(wide_directory.begin(), wide_directory.end());
  *file_name = GetString(env, arguments[1]);
}

napi_value Constructor(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1;
    napi_value arguments[1] = {};
    napi_value this_value = nullptr;
    if (napi_get_cb_info(env, info, &argc, arguments, &this_value, nullptr) !=
            napi_ok ||
        argc != 1) {
      Tampered("native-argument");
    }
    auto* wrapped = new WrappedStore(GetString(env, arguments[0]));
    if (napi_wrap(env, this_value, wrapped, FinalizeStore, nullptr, nullptr) !=
        napi_ok) {
      delete wrapped;
      Tampered("native-instance");
    }
    return this_value;
  } catch (const std::exception& error) {
    Throw(env, error);
    return nullptr;
  }
}

napi_value EnsureLayout(napi_env env, napi_callback_info info) {
  try {
    napi_value this_value = nullptr;
    size_t argc = 0;
    if (napi_get_cb_info(env, info, &argc, nullptr, &this_value, nullptr) !=
        napi_ok) {
      Tampered("native-argument");
    }
    GetWrappedStore(env, this_value)->store.EnsureLayout();
    napi_value result = nullptr;
    napi_get_undefined(env, &result);
    return result;
  } catch (const std::exception& error) {
    Throw(env, error);
    return nullptr;
  }
}

napi_value ReadFile(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 2;
    napi_value arguments[2] = {};
    napi_value this_value = nullptr;
    if (napi_get_cb_info(env, info, &argc, arguments, &this_value, nullptr) !=
            napi_ok ||
        argc != 2) {
      Tampered("native-argument");
    }
    std::string directory;
    std::wstring file_name;
    GetDirectoryAndFile(env, arguments, &directory, &file_name);
    auto data = GetWrappedStore(env, this_value)->store.Read(directory, file_name);
    if (!data) {
      napi_value result = nullptr;
      napi_get_undefined(env, &result);
      return result;
    }
    napi_value result = nullptr;
    void* destination = nullptr;
    if (napi_create_buffer_copy(env, data->size(), data->data(), &destination,
                                &result) != napi_ok) {
      Tampered("native-buffer");
    }
    return result;
  } catch (const std::exception& error) {
    Throw(env, error);
    return nullptr;
  }
}

napi_value WriteAtomic(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 3;
    napi_value arguments[3] = {};
    napi_value this_value = nullptr;
    if (napi_get_cb_info(env, info, &argc, arguments, &this_value, nullptr) !=
            napi_ok ||
        argc != 3) {
      Tampered("native-argument");
    }
    std::string directory;
    std::wstring file_name;
    GetDirectoryAndFile(env, arguments, &directory, &file_name);
    GetWrappedStore(env, this_value)
        ->store.WriteAtomic(directory, file_name, GetBuffer(env, arguments[2]));
    napi_value result = nullptr;
    napi_get_undefined(env, &result);
    return result;
  } catch (const std::exception& error) {
    Throw(env, error);
    return nullptr;
  }
}

napi_value CreateExclusive(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 3;
    napi_value arguments[3] = {};
    napi_value this_value = nullptr;
    if (napi_get_cb_info(env, info, &argc, arguments, &this_value, nullptr) !=
            napi_ok ||
        argc != 3) {
      Tampered("native-argument");
    }
    std::string directory;
    std::wstring file_name;
    GetDirectoryAndFile(env, arguments, &directory, &file_name);
    const bool created = GetWrappedStore(env, this_value)
                             ->store.CreateExclusive(
                                 directory, file_name,
                                 GetBuffer(env, arguments[2]));
    napi_value result = nullptr;
    napi_get_boolean(env, created, &result);
    return result;
  } catch (const std::exception& error) {
    Throw(env, error);
    return nullptr;
  }
}

napi_value RemoveFile(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 2;
    napi_value arguments[2] = {};
    napi_value this_value = nullptr;
    if (napi_get_cb_info(env, info, &argc, arguments, &this_value, nullptr) !=
            napi_ok ||
        argc != 2) {
      Tampered("native-argument");
    }
    std::string directory;
    std::wstring file_name;
    GetDirectoryAndFile(env, arguments, &directory, &file_name);
    const bool removed =
        GetWrappedStore(env, this_value)->store.Remove(directory, file_name);
    napi_value result = nullptr;
    napi_get_boolean(env, removed, &result);
    return result;
  } catch (const std::exception& error) {
    Throw(env, error);
    return nullptr;
  }
}

napi_value Close(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 0;
    napi_value this_value = nullptr;
    if (napi_get_cb_info(env, info, &argc, nullptr, &this_value, nullptr) !=
        napi_ok) {
      Tampered("native-argument");
    }
    GetWrappedStore(env, this_value)->store.Close();
    napi_value result = nullptr;
    napi_get_undefined(env, &result);
    return result;
  } catch (const std::exception& error) {
    Throw(env, error);
    return nullptr;
  }
}

napi_value Open(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1;
    napi_value arguments[1] = {};
    if (napi_get_cb_info(env, info, &argc, arguments, nullptr, nullptr) !=
            napi_ok ||
        argc != 1) {
      Tampered("native-argument");
    }
    napi_value constructor = nullptr;
    if (napi_get_reference_value(env, constructor_reference, &constructor) !=
        napi_ok) {
      Tampered("native-instance");
    }
    napi_value instance = nullptr;
    if (napi_new_instance(env, constructor, 1, arguments, &instance) != napi_ok) {
      Tampered("native-instance");
    }
    return instance;
  } catch (const std::exception& error) {
    Throw(env, error);
    return nullptr;
  }
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor methods[] = {
      {"ensureLayout", nullptr, EnsureLayout, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"readFile", nullptr, ReadFile, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"writeAtomic", nullptr, WriteAtomic, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"createExclusive", nullptr, CreateExclusive, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"removeFile", nullptr, RemoveFile, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"close", nullptr, Close, nullptr, nullptr, nullptr, napi_default,
       nullptr},
  };
  napi_value constructor = nullptr;
  if (napi_define_class(env, "NativeSecureStore", NAPI_AUTO_LENGTH, Constructor,
                        nullptr, std::size(methods), methods, &constructor) !=
          napi_ok ||
      napi_create_reference(env, constructor, 1, &constructor_reference) !=
          napi_ok) {
    napi_throw_error(env, nullptr, "STORE_TAMPERED:native-init");
    return nullptr;
  }
  napi_value open = nullptr;
  if (napi_create_function(env, "open", NAPI_AUTO_LENGTH, Open, nullptr, &open) !=
          napi_ok ||
      napi_set_named_property(env, exports, "open", open) != napi_ok) {
    napi_throw_error(env, nullptr, "STORE_TAMPERED:native-init");
    return nullptr;
  }
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
