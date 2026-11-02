import changelog from "../../../../CHANGELOG.md?raw";

export interface ReleaseHistoryEntry {
  version: string;
  date: string;
  notes: string;
}

// 固定构建资源只解析发行记录；它不代表此电脑曾安装过哪些版本。
export function parseReleaseHistory(source: string): ReleaseHistoryEntry[] {
  const entries: ReleaseHistoryEntry[] = [];
  const sections = [
    ...source.matchAll(
      /^## v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\s+[—-]\s+(\d{4}-\d{2}-\d{2})\s*$/gmu,
    ),
  ];
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index];
    const content = source.slice(
      section.index! + section[0].length,
      sections[index + 1]?.index,
    );
    entries.push({
      version: section[1],
      date: section[2],
      notes: preferredReleaseNotes(content),
    });
  }
  return entries.sort((left, right) => {
    const a = left.version.split(".").map(Number);
    const b = right.version.split(".").map(Number);
    return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
  });
}

export function preferredReleaseNotes(source?: string): string {
  if (!source?.trim()) return "";
  const chinese = /^###\s+简体中文\s*$/mu.exec(source);
  const english = /^###\s+English\s*$/mu.exec(source);
  const heading = chinese ?? english;
  const content = heading
    ? source.slice(heading.index + heading[0].length)
    : source;
  return content.split(/^###\s+/mu)[0].trim();
}

export const releaseHistory = parseReleaseHistory(changelog);
