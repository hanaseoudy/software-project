import { CreateCommentDto } from './create-comment.dto';

// same rules as a new comment: required, trimmed, max 500 characters
export class UpdateCommentDto extends CreateCommentDto {}
