import { CreateCommentDto } from './create-comment.dto';

// BLG-07 retains BLG-05's required, trimmed, 1-500 character text.
export class UpdateCommentDto extends CreateCommentDto {}
