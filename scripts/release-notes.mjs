// 发布构建与包校验共用同一提取规则；内容只来自本次提交的 CHANGELOG。
export function releaseNotesForVersion(changelog, version) {
  changelog = changelog.replace(/\r\n?/gu, "\n");
  const headings = [
    ...changelog.matchAll(
      /^## v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:[ \t]+[^\r\n]*)?\r?$/gmu,
    ),
  ];
  const index = headings.findIndex((heading) => heading[1] === version);
  if (index < 0)
    throw new Error(`CHANGELOG.md does not contain release v${version}.`);
  if (
    headings.some(
      (heading, position) => position !== index && heading[1] === version,
    )
  )
    throw new Error(`CHANGELOG.md contains duplicate release v${version}.`);

  const heading = headings[index];
  const section = changelog.slice(
    heading.index + heading[0].length,
    headings[index + 1]?.index ?? changelog.length,
  );
  const languages = [...section.matchAll(/^### ([^\r\n]+)\r?$/gmu)];
  const preferred = languages.findIndex(
    (entry) => entry[1].trim() === "简体中文",
  );
  const fallback = languages.findIndex(
    (entry) => entry[1].trim() === "English",
  );
  const selected = preferred >= 0 ? preferred : fallback;
  const notes = (
    selected >= 0
      ? section.slice(
          languages[selected].index + languages[selected][0].length,
          languages[selected + 1]?.index ?? section.length,
        )
      : section
  ).trim();
  if (!notes || Buffer.byteLength(notes, "utf8") > 32 * 1024)
    throw new Error(
      `Release notes for v${version} must contain 1..32768 UTF-8 bytes.`,
    );
  return notes;
}
