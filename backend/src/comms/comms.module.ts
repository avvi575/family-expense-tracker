import { Global, Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { CommsController } from './comms.controller';

@Global()
@Module({
  controllers: [CommsController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class CommsModule {}
