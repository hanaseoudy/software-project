import { PickType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto';

// BLG-08: edit a post's tags later. Inherits the exact tag rules of CreatePostDto
// (max 5, each 1-30 characters, trimmed, lowercase, unique, field-level messages).
// BLG-04 will extend PATCH /api/posts/:id with the other fields.
export class UpdateTagsDto extends PickType(CreatePostDto, ['tags'] as const) {}
