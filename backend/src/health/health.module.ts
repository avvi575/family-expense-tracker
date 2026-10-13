import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { CommsModule } from '../comms/comms.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, CommsModule],
  controllers: [HealthController],
})
export class HealthModule {}