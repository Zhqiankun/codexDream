# CodexStyle Code Signing Policy

This document defines the controls that CodexStyle uses for code-signing requests. It is a policy, not evidence that SignPath Foundation has accepted the project or that any particular release is signed. Users must verify the Authenticode signature and the release notes for each downloaded artifact.

**Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).**

## Project and signing scope

- Project: [CodexStyle](https://github.com/Zhqiankun/codexDream), an MIT-licensed open-source Windows x64 desktop application.
- Eligible artifacts are official Windows release executables produced from the public repository by [the GitHub Actions release workflow](.github/workflows/release.yml).
- A maintainer workstation build, an externally supplied binary, a modified release artifact, or an artifact built from an unreviewed commit is not eligible for project signing.
- The signing identity may be used only for CodexStyle. It must not be used for dependencies, third-party software, forks, test binaries, or unrelated projects.
- This policy does not make unsigned releases signed retroactively. A file is signed only when its Authenticode signature validates for that file.

## Roles and responsibilities

CodexStyle currently has one maintainer. The same person necessarily performs the three required roles, but treats each role as a separate checkpoint:

| Role      | Assigned person | Responsibility                                                                                                                                              |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Committer | `Zhqiankun`     | Maintains the repository, evaluates changes, merges accepted contributions, and creates release commits and tags.                                           |
| Reviewer  | `Zhqiankun`     | Reviews the complete diff, security boundaries, dependency changes, tests, and workflow results before a change becomes eligible for release.               |
| Approver  | `Zhqiankun`     | Independently checks the tagged source, build provenance, artifact identity, and policy compliance, then manually approves or rejects each signing request. |

External contributors may submit issues and pull requests, but they are not committers, reviewers, or signing approvers. Every external contribution must be reviewed by `Zhqiankun` and pass the applicable automated checks before it is merged. External contributors cannot submit or approve signing requests.

When the maintainer authors a change, the reviewer checkpoint still requires a fresh review of the final diff and verification results before release. If additional maintainers join, role assignments and least-privilege access will be documented here.

Accounts that can merge release code, change the release workflow, access signing-submission credentials, or approve signing requests must use multi-factor authentication. Credentials must not be shared.

## Review and release requirements

Before an artifact may be submitted for signing:

1. The source must be committed to the public repository and selected by an immutable stable SemVer tag in the form `vX.Y.Z`.
2. The release version and metadata must match the tag.
3. The reviewer must inspect the final change, including build scripts, dependencies, security-sensitive behavior, and release metadata.
4. The required GitHub Actions checks must pass. The release artifact must be built on the GitHub-hosted Windows runner from the tagged commit with the repository's locked dependencies.
5. The workflow must preserve a verifiable link among the source commit, workflow run, unsigned input artifact, signing request, signed result, checksums, and published release.

Once signing integration is enabled, the eligible artifact will be passed from the trusted GitHub Actions build to SignPath. It must not be rebuilt or repackaged on a maintainer workstation between verification, signing, and publication.

Every release signing request requires an explicit manual decision by the Approver. There is no unattended signing approval. Before approving, the Approver checks at least:

- the repository, tag, commit, workflow, version, artifact names, and architecture;
- successful review, tests, package verification, and checksum generation;
- that the requested files came from the expected GitHub Actions run;
- that the request uses the CodexStyle artifact configuration and signing policy; and
- that no unexplained, third-party, or locally substituted binary is present.

A mismatch, failed check, unexplained workflow change, suspected credential compromise, or uncertain provenance requires rejection. After signing, the workflow must verify the returned Authenticode signature and publish only the verified result with the corresponding release checksums.

## Signing credentials and auditability

- Certificate private keys must not be stored in this repository, GitHub Actions, release artifacts, or maintainer-accessible files. Key custody remains with the signing service.
- A submission credential, if required, is stored as a restricted GitHub Actions secret and grants no broader repository access than necessary.
- Signing configuration and release-workflow changes receive the same review as application code.
- Public source, tags, workflow definitions, workflow results, release artifacts, and checksums provide the reproducible audit trail available to users. SignPath retains the signing-request and approval records within its service.

## Security incidents

On suspected source, workflow, account, token, or signing compromise, the maintainer will stop new signing requests, reject pending requests, rotate affected credentials, investigate published artifacts, and contact SignPath Foundation when certificate action may be required. Affected releases will not be silently replaced; any correction will use a new version and a public notice.

Security concerns may be reported through the repository's [issue tracker](https://github.com/Zhqiankun/codexDream/issues). Do not include secrets or sensitive personal data in a public issue.

---

# CodexStyle 代码签名政策

本文档规定 CodexStyle 代码签名请求必须遵守的控制措施。它是一份政策，不代表 SignPath Foundation 已批准本项目，也不代表任何特定版本已经签名。用户应逐个核验下载文件的 Authenticode 签名和对应 Release 说明。

**免费代码签名由 [SignPath.io](https://signpath.io/) 提供，证书由 [SignPath Foundation](https://signpath.org/) 提供。**

## 项目与签名范围

- 项目：[CodexStyle](https://github.com/Zhqiankun/codexDream)，使用 MIT 许可证的 Windows x64 开源桌面应用。
- 只有公开仓库中由 [GitHub Actions Release 工作流](.github/workflows/release.yml) 生成的正式 Windows 发布可执行文件才有资格申请签名。
- 维护者电脑上的构建、外部提供的二进制、修改过的发布产物或来自未评审提交的产物不得申请项目签名。
- 签名身份仅限 CodexStyle 使用，不得用于依赖项、第三方软件、分叉项目、测试二进制或无关项目。
- 本政策不会把历史未签名版本自动变为已签名版本。只有文件本身的 Authenticode 签名验证有效，才能视为已签名。

## 角色与职责

CodexStyle 当前只有一名维护者，因此三个角色均由同一人承担，但每个角色都作为独立检查点执行：

| 角色                | 负责人      | 职责                                                                               |
| ------------------- | ----------- | ---------------------------------------------------------------------------------- |
| Committer（提交者） | `Zhqiankun` | 维护仓库、评估变更、合并已接受的贡献，并创建发布提交与标签。                       |
| Reviewer（评审者）  | `Zhqiankun` | 在变更具备发布资格前，评审完整差异、安全边界、依赖变化、测试和工作流结果。         |
| Approver（批准者）  | `Zhqiankun` | 独立检查标签源码、构建来源、产物身份及政策符合性，并人工批准或拒绝每一次签名请求。 |

外部贡献者可以提交 Issue 和 Pull Request，但不属于提交者、评审者或签名批准者。每项外部贡献都必须由 `Zhqiankun` 评审，并在合并前通过适用的自动化检查。外部贡献者不能提交或批准签名请求。

当变更由维护者本人编写时，评审检查点仍要求其在发布前重新审阅最终差异和验证结果。未来如增加维护者，将在本文档中记录角色分配，并按最小权限原则管理访问。

凡有权合并发布代码、修改发布工作流、访问签名提交凭据或批准签名请求的账号，都必须启用多因素认证。凭据不得共享。

## 评审与发布要求

产物提交签名前必须满足：

1. 源码已提交至公开仓库，并由不可变的稳定 SemVer 标签 `vX.Y.Z` 唯一指向。
2. 发布版本与元数据和标签一致。
3. 评审者已检查最终变更，包括构建脚本、依赖、安全敏感行为和发布元数据。
4. 必需的 GitHub Actions 检查全部通过；产物由 GitHub 托管的 Windows Runner 根据标签提交和仓库锁定依赖构建。
5. 工作流保留源码提交、运行记录、未签名输入产物、签名请求、已签名结果、校验值和公开 Release 之间可核验的关联。

签名集成启用后，符合条件的产物将由可信 GitHub Actions 构建直接交给 SignPath。在验证、签名和发布之间，不得在维护者电脑上重新构建或重新打包。

每个正式版本的签名请求都必须由批准者人工明确决定，不允许无人值守的自动批准。批准者至少检查：

- 仓库、标签、提交、工作流、版本、产物名称和架构；
- 评审、测试、安装包验证和校验值生成均已通过；
- 请求文件确实来自预期的 GitHub Actions 运行；
- 请求使用 CodexStyle 对应的产物配置和签名政策；
- 不存在来源不明、第三方或本地替换的二进制。

如有版本不一致、检查失败、工作流变更无法解释、疑似凭据泄露或来源不确定，必须拒绝请求。签名完成后，工作流必须验证返回文件的 Authenticode 签名，并且只发布验证通过的结果及对应校验值。

## 签名凭据与审计

- 证书私钥不得存放在本仓库、GitHub Actions、发布产物或维护者可访问的文件中；私钥由签名服务保管。
- 如需签名提交凭据，只能把它作为受限的 GitHub Actions Secret 保存，且不得授予超出必要范围的仓库权限。
- 签名配置和 Release 工作流变更与应用代码执行同等评审。
- 公开源码、标签、工作流定义、运行结果、发布产物与校验值构成用户可查看的审计链；SignPath 在其服务内保留签名请求和批准记录。

## 安全事件

如果怀疑源码、工作流、账号、令牌或签名能力遭到破坏，维护者将停止新的签名请求、拒绝待处理请求、轮换受影响凭据、调查已发布产物，并在可能需要处置证书时联系 SignPath Foundation。受影响版本不会被静默替换；任何修正都将使用新版本并公开说明。

安全问题可通过仓库的 [Issue 页面](https://github.com/Zhqiankun/codexDream/issues)报告。请勿在公开 Issue 中填写密钥或敏感个人信息。
