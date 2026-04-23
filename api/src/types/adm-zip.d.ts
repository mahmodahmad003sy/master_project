declare module "adm-zip" {
  class AdmZip {
    constructor(path?: string);
    getEntries(): Array<{
      entryName: string;
      isDirectory: boolean;
      getData(): Buffer;
    }>;
  }

  export default AdmZip;
}
