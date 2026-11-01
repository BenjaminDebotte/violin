import JSZip from 'jszip';

export type ScoreFormat = 'musicxml' | 'mxl';

export type FileErrorCode =
  | 'MSCZ_NOT_SUPPORTED'
  | 'PDF_NOT_SUPPORTED'
  | 'EMPTY_FILE'
  | 'INVALID_EXTENSION';

export interface ValidateScoreSuccess {
  readonly valid: true;
  readonly format: ScoreFormat;
}

export interface ValidateScoreFailure {
  readonly valid: false;
  readonly errorCode: FileErrorCode;
  readonly userMessage: string;
}

export type ValidateScoreResult = ValidateScoreSuccess | ValidateScoreFailure;

/**
 * Validates an uploaded score file based on name and optional size.
 * Rejects .mscz/.mscx and .pdf with explicit MuseScore export instructions.
 */
export function validateScoreFile(file: {
  readonly name: string;
  readonly size?: number;
}): ValidateScoreResult {
  if (file.size !== undefined && file.size === 0) {
    return {
      valid: false,
      errorCode: 'EMPTY_FILE',
      userMessage: 'The selected file is empty (0 bytes). Please upload a valid MusicXML (.musicxml or .mxl) file.',
    };
  }

  const lastDotIndex = file.name.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return {
      valid: false,
      errorCode: 'INVALID_EXTENSION',
      userMessage: 'The file has no extension. Please upload a .musicxml or .mxl file.',
    };
  }

  const ext = file.name.slice(lastDotIndex).toLowerCase();

  if (ext === '.mscz' || ext === '.mscx') {
    return {
      valid: false,
      errorCode: 'MSCZ_NOT_SUPPORTED',
      userMessage:
        'MuseScore files (.mscz / .mscx) cannot be read directly. In MuseScore, go to File -> Export -> MusicXML (.mxl or .musicxml), then upload the exported file here.',
    };
  }

  if (ext === '.pdf') {
    return {
      valid: false,
      errorCode: 'PDF_NOT_SUPPORTED',
      userMessage:
        'Raw PDF files are not supported as sheet music. Open or import your score in MuseScore, then go to File -> Export -> MusicXML to export as .mxl or .musicxml before uploading.',
    };
  }

  if (ext === '.musicxml' || ext === '.xml') {
    return {
      valid: true,
      format: 'musicxml',
    };
  }

  if (ext === '.mxl') {
    return {
      valid: true,
      format: 'mxl',
    };
  }

  return {
    valid: false,
    errorCode: 'INVALID_EXTENSION',
    userMessage: `Unsupported file extension "${ext}". Please upload a .musicxml or .mxl file.`,
  };
}

/**
 * Unpacks MusicXML from either raw XML text/buffer or a compressed .mxl (JSZip) container.
 * Returns the decoded UTF-8 MusicXML string.
 */
export async function unpackScoreFile(
  fileName: string,
  content: ArrayBuffer | Uint8Array | string,
): Promise<string> {
  const lastDotIndex = fileName.lastIndexOf('.');
  const ext = lastDotIndex !== -1 ? fileName.slice(lastDotIndex).toLowerCase() : '';

  if (ext === '.musicxml' || ext === '.xml') {
    let xmlString: string;
    if (typeof content === 'string') {
      xmlString = content;
    } else {
      const decoder = new TextDecoder('utf-8');
      xmlString = decoder.decode(content);
    }

    if (!xmlString.includes('<score-partwise') && !xmlString.includes('<score-timewise')) {
      throw new Error('Invalid MusicXML: missing <score-partwise> root element');
    }
    return xmlString;
  }

  if (ext === '.mxl') {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(content);
    } catch (err) {
      throw new Error(`Failed to unpack .mxl archive: ${(err as Error).message}`);
    }

    let rootPath: string | null = null;
    const containerFile = zip.file('META-INF/container.xml');
    if (containerFile) {
      const containerXml = await containerFile.async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(containerXml, 'application/xml');
      const rootfile = doc.querySelector('rootfile');
      rootPath = rootfile?.getAttribute('full-path') || null;
    }

    let scoreFile = rootPath ? zip.file(rootPath) : null;
    if (!scoreFile) {
      for (const [relativePath, fileObj] of Object.entries(zip.files)) {
        if (
          !fileObj.dir &&
          !relativePath.startsWith('META-INF/') &&
          !relativePath.startsWith('__MACOSX/') &&
          !relativePath.startsWith('.') &&
          (relativePath.endsWith('.xml') || relativePath.endsWith('.musicxml'))
        ) {
          scoreFile = fileObj;
          break;
        }
      }
    }

    if (!scoreFile) {
      throw new Error('Could not find MusicXML root file in .mxl archive');
    }

    const scoreXml = await scoreFile.async('string');
    if (!scoreXml.includes('<score-partwise') && !scoreXml.includes('<score-timewise')) {
      throw new Error('Invalid MusicXML in .mxl archive: missing <score-partwise> root element');
    }
    return scoreXml;
  }

  throw new Error(`Unsupported score file format: ${fileName}`);
}
