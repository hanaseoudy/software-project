import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PostImagesController } from './post-images.controller';
import { PostImagesService } from './post-images.service';
import { Post, PostSchema } from './schemas/post.schema';

// BLG-10: post image attachment and removal (reuses GEN-08 UploadsService unchanged)
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
    AuthModule,
    UploadsModule,
  ],
  controllers: [PostImagesController],
  providers: [PostImagesService],
})
export class PostImagesModule {}
