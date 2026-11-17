import { ApiProperty } from '@nestjs/swagger';

// Shape of Nest's default HttpException error body, documented for Swagger
export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ example: 'Post not found' })
  message!: string;

  @ApiProperty({ example: 'Not Found' })
  error!: string;
}
