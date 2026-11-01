declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_DEMO?: string;
  readonly VITE_SERVER?: string;
}

// exceljs's ready-made browser bundle; its types are the package's own.
declare module "exceljs/dist/exceljs.min.js" {
  const ExcelJS: typeof import("exceljs");
  export default ExcelJS;
}
