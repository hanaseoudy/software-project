import { ApiProperty } from '@nestjs/swagger';

// BLG-08: one entry of the GET /tags response
export class TagCountDto {
  @ApiProperty({ example: 'rome' })
  tag: string;

  @ApiProperty({ example: 3, description: 'Number of published posts with this tag' })
  postsCount: number;
}
