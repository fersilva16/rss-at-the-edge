import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export const xmlParser = new XMLParser({ ignoreAttributes: false });
export const xmlBuilder = new XMLBuilder({ ignoreAttributes: false });
