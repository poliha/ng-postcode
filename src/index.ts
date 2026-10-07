export {
  assemble, disassemble, format, parse, parsePartial, isValidFormat,
  PostcodeFormatError, SEGMENT_ORDER,
  type Segments, type SegmentName, type FormattedPostcode, type PartialPostcode,
} from './format'
export { createPostcodeClient, PostcodeApiError, type ClientOptions, type PostcodeClient } from './client'
export { SANDBOX_POSTCODES, TEST_POSTCODES } from './data'
export type * from './types'
