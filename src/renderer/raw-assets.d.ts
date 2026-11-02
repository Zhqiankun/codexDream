// Vite 将固定文档编入发行包，renderer 不获得文件系统访问能力。
declare module "*.md?raw" {
  const content: string;
  export default content;
}
