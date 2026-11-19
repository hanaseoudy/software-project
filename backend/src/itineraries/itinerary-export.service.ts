import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { City } from '../reference-data/schemas/city.schema';
import { Activity } from './schemas/activity.schema';
import { ItineraryDay } from './schemas/itinerary-day.schema';
import { Itinerary } from './schemas/itinerary.schema';
import { buildItineraryPdf, pdfFilename } from './utils/itinerary-pdf';
import type { PdfActivity, PdfDay } from './utils/itinerary-pdf';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Activities of one day: timed ones first in time order, then the untimed ones. */
export function byTime(a: PdfActivity, b: PdfActivity): number {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return 0;
}

/**
 * ITN-28: export (or print) one of the user's own itineraries as a PDF.
 * Read only; it shows what ITN-03 shows plus the cities and activities of each day.
 */
@Injectable()
export class ItineraryExportService {
  constructor(
    @InjectModel(Itinerary.name)
    private readonly itineraryModel: Model<Itinerary>,
    @InjectModel(ItineraryDay.name)
    private readonly dayModel: Model<ItineraryDay>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
  ) {}

  async exportPdf(userId: string, itineraryId: string) {
    if (!Types.ObjectId.isValid(itineraryId)) {
      throw new NotFoundException('Itinerary not found');
    }
    const itinerary = await this.itineraryModel
      .findOne({
        _id: new Types.ObjectId(itineraryId),
        userId: new Types.ObjectId(userId),
      })
      .lean();
    if (!itinerary) throw new NotFoundException('Itinerary not found');

    const days = await this.dayModel
      .find({ itineraryId: itinerary._id })
      .sort({ dayNumber: 1 })
      .lean();

    const [cities, activities] = days.length
      ? await Promise.all([
          this.cityModel
            .find({ cityId: { $in: [...new Set(days.map((d) => d.cityId))] } })
            .lean(),
          this.activityModel
            .find({ dayId: { $in: days.map((d) => d._id) } })
            .sort({ _id: 1 })
            .lean(),
        ])
      : [[], []];

    const cityName = new Map(cities.map((c) => [c.cityId, c.name]));
    const activitiesByDay = new Map<string, PdfActivity[]>();
    for (const a of activities) {
      const key = String(a.dayId);
      const list = activitiesByDay.get(key) ?? [];
      list.push({
        name: a.name,
        description: a.description,
        time: a.time,
        cost: a.cost,
        currency: a.currency,
      });
      activitiesByDay.set(key, list);
    }

    const pdfDays: PdfDay[] = days.map((day) => {
      const date = new Date(itinerary.startDate);
      date.setUTCDate(date.getUTCDate() + day.dayNumber - 1);
      return {
        dayNumber: day.dayNumber,
        date: isoDate(date),
        cityName: cityName.get(day.cityId) ?? day.cityId,
        notes: day.notes,
        activities: (activitiesByDay.get(String(day._id)) ?? []).sort(byTime),
      };
    });

    const pdf = await buildItineraryPdf({
      title: itinerary.title,
      countryIds: itinerary.countryIds,
      startDate: isoDate(itinerary.startDate),
      days: pdfDays,
    });
    return { filename: pdfFilename(itinerary.title), pdf };
  }
}
