{
  "targets": [
    {
      "target_name": "secure_store",
      "sources": ["src/secure_store.cc"],
      "defines": ["NAPI_VERSION=10"],
      "libraries": ["ntdll.lib", "bcrypt.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": ["/std:c++20", "/EHsc"]
        }
      }
    }
  ]
}
