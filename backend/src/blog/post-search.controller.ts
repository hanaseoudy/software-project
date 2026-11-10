import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { PostSearchResponseDto } from './dto/post-search-response.dto';
import { SearchPostsQueryDto } from './dto/search-posts-query.dto';
import { PostSearchService } from './post-search.service';

// BLG-09: public post search. This controller is registered before BlogController in BlogModule,
// so /posts/search is matched before any /posts/:id route.
@ApiTags('blog')
@Controller('posts')
export class PostSearchController {
  constructor(private readonly postSearchService: PostSearchService) {}

  // Public, no login needed
  @Get('search')
  @ApiOperation({
    summary: 'Search published posts by title, tags or author name (BLG-09)',
    description:
      'Public. Case-insensitive keyword match on the post title, its tags, or the author\'s first, last or full name. ' +
      'Results are ordered by interaction score (likes + comments) descending, newest first as a tie-breaker. ' +
      '10 results per page. When nothing matches, items is empty, total is 0 and message is "No results".',
  })
  @ApiQuery({ name: 'q', required: true, example: 'luxor', description: 'Keyword, 1-100 characters (trimmed)' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number, integer >= 1 (default 1)' })
  @ApiOkResponse({ description: 'One page of matching posts', type: PostSearchResponseDto })
  @ApiBadRequestResponse({
    description: 'q is missing, blank or longer than 100 characters, or page is not an integer >= 1',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: {
        q: ['Search keyword is required'],
        page: ['Page must be at least 1'],
      },
    },
  })
  search(@Query() query: SearchPostsQueryDto): Promise<PostSearchResponseDto> {
    return this.postSearchService.search(query);
  }
}
