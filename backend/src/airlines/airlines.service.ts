import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { AuthPayload } from '../common/guards/jwt-auth.guard';
import { Airline, AirlineDocument } from './schemas/airline.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentDocument,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema'; // adjust to where your file is
import { CreateAirlineDto } from './dto/create-airline.dto';
import { UpdateAirlineDto } from './dto/update-airline.dto';
import { UploadedImage, UploadsService } from '../uploads/uploads.service';
import { ImageCategory } from '../uploads/uploads.constants';
import { SetBaggagePolicyDto } from './dto/set-baggage-policy.dto';

@Injectable()
export class AirlinesService {
  constructor(
    @InjectModel(Airline.name) private airlineModel: Model<AirlineDocument>,
    @InjectModel(ModeratorAssignment.name)
    private assignmentModel: Model<ModeratorAssignmentDocument>,
    private readonly uploads: UploadsService,
  ) {}

  private validateObjectId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid airline ID: ${id}`);
    }
  }

  async create(dto: CreateAirlineDto) {
    try {
      return await this.airlineModel.create(dto);
    } catch (err: any) {
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0]; // "name" or "code"
        throw new ConflictException(
          `An airline with this ${field} already exists`,
        );
      }
      throw err; // anything else is a real error, so let it through
    }
  }

  async findOne(id: string) {
    this.validateObjectId(id);
    const airline = await this.airlineModel.findById(id);
    if (!airline) throw new NotFoundException('Airline not found');
    return airline;
  }

  async setBaggagePolicy(
    id: string,
    dto: SetBaggagePolicyDto,
    user: AuthPayload,
  ) {
    // 1. Validate ID format and verify moderator owns this airline (400 / 403)
    await this.assertOwnsAirline(id, user.sub);

    // 2. Update the airline's extra baggage policy fields
    const airline = await this.airlineModel.findByIdAndUpdate(
      id,
      {
        baggagePolicy: {
          extraBagPrice: dto.extraBagPrice,
          maxExtraBagsPerPassenger: dto.maxExtraBagsPerPassenger,
        },
      },
      { new: true, runValidators: true },
    );

    // 3. Ensure airline still exists (404)
    if (!airline) {
      throw new NotFoundException('Airline not found');
    }

    return airline;
  }

  private async assertOwnsAirline(airlineId: string, userId: string) {
    this.validateObjectId(airlineId);
    const assignment = await this.assignmentModel.findOne({
      moderatorId: userId,
      providerType: ProviderType.AIRLINE,
      providerId: airlineId,
    });
    if (!assignment) throw new ForbiddenException('Not your airline');
  }

  async update(id: string, dto: UpdateAirlineDto, user: AuthPayload) {
    await this.assertOwnsAirline(id, user.sub); // 1. is it yours? (403)
    try {
      const airline = await this.airlineModel.findByIdAndUpdate(id, dto, {
        new: true,
        runValidators: true,
      });
      if (!airline) throw new NotFoundException('Airline not found'); // 2. still exists? (404)
      return airline;
    } catch (err: any) {
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        throw new ConflictException(
          `An airline with this ${field} already exists`,
        );
      }
      throw err; // includes the NotFoundException above, so it passes through untouched
    }
  }

  async setLogo(id: string, file: UploadedImage, user: AuthPayload) {
    await this.assertOwnsAirline(id, user.sub);
    const airline = await this.findOne(id); // 2. does it exist? (404)
    const oldLogoUrl = airline.logoUrl; // remember the current logo

    const [logoUrl] = await this.uploads.saveImages(
      file ? [file] : undefined, // 3. store the new file
      ImageCategory.AIRLINE,
    );
    const updated = await this.airlineModel.findByIdAndUpdate(
      // 4. point to the new file
      id,
      { logoUrl },
      { new: true },
    );

    if (oldLogoUrl) {
      await this.uploads.deleteByUrl(oldLogoUrl).catch(() => undefined); // 5. remove the old file
    }
    return updated;
  }
}
