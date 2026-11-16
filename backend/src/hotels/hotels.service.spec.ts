
    
  
        });
      });

      it('returns 409 and does not save when a reservation overlaps', async () => {
        setup();
        bookingModel.exists.mockReturnValue(execResult({ _id: 'booking' }));

        const error = await call().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toContain('reservation');
        expect(availabilityModel.create).not.toHaveBeenCalled();
      });

      it('rejects an end date before the start date', async () => {
        setup();
        const error = await call({
          startDate: '2026-12-15',
          endDate: '2026-12-10',
        }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(
          (
            (error as BadRequestException).getResponse() as {
              errors: Record<string, string[]>;
            }
          ).errors,
        ).toHaveProperty('endDate');
        expect(bookingModel.exists).not.toHaveBeenCalled();
        expect(availabilityModel.create).not.toHaveBeenCalled();
      });

      it('rejects a date that is not a real day', async () => {
        setup();
        const error = await call({
          startDate: '2026-02-30',
          endDate: '2026-03-02',
        }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(availabilityModel.create).not.toHaveBeenCalled();
      });
    });

    describe('deactivateRoom', () => {
      const call = () => service.deactivateRoom(idOf(), idOf(), moderator);

      sharedGuards(call);

      it('deactivates the room when nothing is reserved', async () => {
        const { room } = setup();

        const result = await call();

        expect(room.isActive).toBe(false);
        expect(room.save).toHaveBeenCalled();
        expect(result).toEqual(
          expect.objectContaining({ id: String(room._id), isActive: false }),
        );
      });

      it('looks for Confirmed or Pending Payment stays that have not ended yet', async () => {
        const { room } = setup();
        await call();
        const filter = bookingModel.exists.mock.calls[0][0] as {
          'rooms.room': unknown;
          status: unknown;
          checkOut: { $gt: Date };
        };
        expect(filter['rooms.room']).toBe(room._id);
        expect(filter.status).toEqual({ $in: ['CONFIRMED', 'PENDING_PAYMENT'] });
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        expect(filter.checkOut.$gt.getTime()).toBe(today.getTime());
      });

      it('returns 409 and keeps the room active when a reservation has not ended', async () => {
        const { room } = setup();
        bookingModel.exists.mockReturnValue(execResult({ _id: 'booking' }));

        await expect(call()).rejects.toBeInstanceOf(ConflictException);

        expect(room.isActive).toBe(true);
        expect(room.save).not.toHaveBeenCalled();
      });

      it('returns the room unchanged when it is already inactive', async () => {
        const { room } = setup({ isActive: false });

        const result = await call();

        expect(result.isActive).toBe(false);
        expect(bookingModel.exists).not.toHaveBeenCalled();
        expect(room.save).not.toHaveBeenCalled();
      });
    });

    describe('deleteRoom', () => {
      const call = () => service.deleteRoom(idOf(), idOf(), moderator);

      sharedGuards(call);

      it('returns 404 for a malformed room id', async () => {
        setup();
        await expect(
          service.deleteRoom(idOf(), 'not-an-id', moderator),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('deletes a room that was never reserved, with its availability ranges', async () => {
        const { room } = setup();

        await expect(call()).resolves.toBeUndefined();

        expect(bookingModel.exists).toHaveBeenCalledWith({
          'rooms.room': room._id,
        });
        expect(availabilityModel.deleteMany).toHaveBeenCalledWith({
          room: room._id,
        });
        expect(roomModel.deleteOne).toHaveBeenCalledWith({ _id: room._id });
      });

      it('returns 409 and deletes nothing when the room has been reserved before', async () => {
        setup();
        bookingModel.exists.mockReturnValue(execResult({ _id: 'booking' }));

        await expect(call()).rejects.toBeInstanceOf(ConflictException);

