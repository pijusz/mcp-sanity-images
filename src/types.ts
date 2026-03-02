export interface SanityAsset {
  _id: string;
  url: string;
}

export interface SanityImageRef {
  _type: "image";
  alt?: string;
  asset: {
    _type: "reference";
    _ref: string;
  };
}

export interface SanityConfig {
  projectId: string;
  dataset: string;
}

export interface UploadResult {
  assetId: string;
  url: string;
  alt: string;
  reference: SanityImageRef;
}

export interface ImageInfo {
  path: string;
  name: string;
  size: number;
  extension: string;
}

export interface BatchUploadResult extends UploadResult {
  filePath: string;
}

export type ToolContent = { type: "text"; text: string };
export type ToolResponse = {
  content: ToolContent[];
  isError?: boolean;
};
