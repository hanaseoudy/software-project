// common/pipes/parse-object-id.pipe.ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isObjectIdOrHexString } from 'mongoose';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string> {
  transform(value: string) {
    if (!isObjectIdOrHexString(value)) {
      throw new BadRequestException('Invalid id');
    }
    return value;
  }
}
