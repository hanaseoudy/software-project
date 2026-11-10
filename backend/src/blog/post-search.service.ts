import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchPostsQueryDto } from './dto/search-posts-query.dto';
import { buildSearchPipeline, PostSearchFacet, PostSearchPage, toSearchPage } from './post-search.helpers';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';

// BLG-09: search published posts by title, tags or author name, ranked by interactions then recency.
@Injectable()
export class PostSearchService {
  constructor(@InjectModel(Post.name) private readonly postModel: Model<PostDocument>) {}

  async search(query: SearchPostsQueryDto): Promise<PostSearchPage> {
    const page = query.page ?? 1;
    const pipeline = buildSearchPipeline({
      q: query.q,
      page,
      publishedStatus: PostStatus.PUBLISHED,
      usersCollection: this.usersCollection(),
    });
    const [facet] = await this.postModel.aggregate<PostSearchFacet>(pipeline as any[]);
    return toSearchPage(facet, page);
  }

  // Read-only: the users collection is only joined for the author name.
  private usersCollection(): string {
    return this.postModel.db.models['User']?.collection.collectionName ?? 'users';
  }
}
