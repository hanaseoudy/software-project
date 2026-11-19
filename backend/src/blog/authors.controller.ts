import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { PaginationQueryDto } from '../common/pagination/pagination';
import { StrictQuery } from '../reports/strict-query.decorator';
import { BlogService } from './blog.service';
import { AuthorIdParamDto, AuthorPageDto } from './dto/author-page.dto';
import { ErrorResponseDto } from './dto/error-response.dto';

// BLG-12: public (guests and registered users), so it has no login guard
@ApiTags('blog')
@Controller('authors')
export class AuthorsController {
  constructor(private readonly blogService: BlogService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Public author page (BLG-12)',
    description:
      'Public, no login needed. Shows the author name and join date, the published posts newest first ' +
      '(the same items as GET /api/posts, 10 per page, GEN-05; only "page" is accepted, unknown parameters are ' +
      'rejected) and up to 10 public itineraries, most recently updated first. Drafts, hidden posts and private or ' +
      'hidden itineraries are never shown. Deactivated authors (ACC-12) and moderator or admin accounts are not ' +
      'shown (404). An author with no content returns 200 with empty lists.',
  })
  @ApiParam({ name: 'id', description: 'Author (user) id', example: '6650f1c2a1b2c3d4e5f60700' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Posts page, starting at 1' })
  @ApiOkResponse({ description: 'The author page', type: AuthorPageDto })
  @ApiBadRequestResponse({
    description: 'Invalid author id, invalid page or an unknown query parameter',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { id: ['Author id must be a valid id'] } },
  })
  @ApiNotFoundResponse({
    description: 'No such author, a deactivated account, or a moderator or admin account',
    type: ErrorResponseDto,
    example: { statusCode: 404, message: 'Author not found', error: 'Not Found' },
  })
  getAuthor(@Param() params: AuthorIdParamDto, @StrictQuery() query: PaginationQueryDto): Promise<AuthorPageDto> {
    return this.blogService.getAuthorPage(params.id, query.page ?? 1);
  }
}
