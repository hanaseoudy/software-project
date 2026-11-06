import { PartialType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto';

// every field of CreatePostDto, all optional (BLG-04)
export class UpdatePostDto extends PartialType(CreatePostDto) {}