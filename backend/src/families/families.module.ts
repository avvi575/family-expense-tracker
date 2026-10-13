import { Module } from '@nestjs/common';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [FamiliesController],
  providers: [FamiliesService],
  exports: [FamiliesService],
  imports: [NotificationsModule],
})
export class FamiliesModule {}
