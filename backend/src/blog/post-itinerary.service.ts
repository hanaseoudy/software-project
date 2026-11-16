import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Error as MongooseError, isValidObjectId, Model, Types } from 'mongoose';
import { ITINERARY_ID_MESSAGE } from './dto/attach-itinerary.dto';
import { PostItineraryResponseDto } from './dto/post-itinerary-response.dto';
import { Post, PostDocument } from './schemas/post.schema';
import { Itinerary, ItineraryDocument } from '../itineraries/schemas/itinerary.schema';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

@Injectable()
export class PostItineraryService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    // Read-only: used only to check that the itinerary exists and belongs to the user
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<ItineraryDocument>,
  ) {}

  // BLG-13 (optional): the author attaches one of their own itineraries to their post (any status),
  // or removes it with null. One itinerary per post: the existing Post.itinerary field is replaced.
  async setItinerary(userId: string, postId: string, itineraryId: unknown): Promise<PostItineraryResponseDto> {
    const author = this.toUserObjectId(userId);
    const id = this.toPostObjectId(postId);
    const itinerary = this.toItineraryObjectId(itineraryId);

    // Private itineraries are accessible only to their owners (project description 6.5)
    if (itinerary) {
      const found = await this.runDb('Could not load the itinerary', () =>
        this.itineraryModel
          .findById(itinerary)
          .select('userId')
          .lean<{ _id: Types.ObjectId; userId: Types.ObjectId }>()
          .exec(),
      );
      if (!found) throw new NotFoundException('Itinerary not found');
      if (!found.userId?.equals(author)) {
        throw new ForbiddenException('You can only attach your own itineraries');
      }
    }

    // One atomic update that matches the post id AND its author, so another user's post can never be changed
    const updated = await this.runDb('Could not update the post', () =>
      this.postModel
        .findOneAndUpdate(
          { _id: id, author },
          { $set: { itinerary } },
          { new: true, runValidators: true, projection: { itinerary: 1 } },
        )
        .lean<{ _id: Types.ObjectId; itinerary?: Types.ObjectId | null }>()
        .exec(),
    );
    if (!updated) {
      // Nothing matched: tell a missing post (404) apart from someone else's post (403)
      const exists = await this.runDb('Could not load the post', () => this.postModel.exists({ _id: id }).exec());
      if (!exists) throw new NotFoundException('Post not found');
      throw new ForbiddenException('You can only edit your own posts');
    }
    return {
      postId: updated._id.toString(),
      itineraryId: updated.itinerary ? updated.itinerary.toString() : null,
    };
  }

  private toUserObjectId(userId: string): Types.ObjectId {
    if (!userId || !isValidObjectId(userId)) {
      throw new UnauthorizedException('Not authenticated');
    }
    return new Types.ObjectId(userId);
  }

  // Strict check: Mongoose's isValidObjectId also accepts any 12-character string
  private toPostObjectId(postId: string): Types.ObjectId {
    if (typeof postId !== 'string' || !OBJECT_ID_PATTERN.test(postId)) {
      throw new NotFoundException('Post not found');
    }
    return new Types.ObjectId(postId);
  }

  // Service-level check that never trusts the DTO: null removes, otherwise a valid id is required
  private toItineraryObjectId(itineraryId: unknown): Types.ObjectId | null {
    if (itineraryId === null) return null;
    if (typeof itineraryId !== 'string' || !OBJECT_ID_PATTERN.test(itineraryId)) {
      throw new BadRequestException({ message: 'Validation failed', errors: { itineraryId: [ITINERARY_ID_MESSAGE] } });
    }
    return new Types.ObjectId(itineraryId);
  }

  // Map Mongoose validation errors to 400 (GEN-02 shape) and other database failures to a clean 500
  private async runDb<T>(message: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof MongooseError.ValidationError) {
        const errors: Record<string, string[]> = {};
        for (const [field, fieldError] of Object.entries(error.errors)) {
          (errors[field] ??= []).push(fieldError.message);
        }
        throw new BadRequestException({ message: 'Validation failed', errors });
      }
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException({ message: 'Validation failed', errors: { [error.path]: ['Invalid value'] } });
      }
      throw new InternalServerErrorException(message);
    }
  }
}
