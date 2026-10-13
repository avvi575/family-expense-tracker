import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { ContributeDto, CreateGoalDto, UpdateGoalDto } from './goals.dto';

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private goals: GoalsService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Query('familyId') familyId: string) {
    return this.goals.list(familyId, userId);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateGoalDto) {
    return this.goals.create(userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateGoalDto) {
    return this.goals.update(id, userId, dto);
  }

  @Post(':id/contribute')
  contribute(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ContributeDto,
  ) {
    return this.goals.contribute(id, userId, dto.amount, dto.note);
  }

  @Get(':id/contributions')
  listContributions(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.goals.listContributions(id, userId);
  }

  @Delete(':id/contributions/:contributionId')
  removeContribution(
    @Param('id') id: string,
    @Param('contributionId') contributionId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.goals.removeContribution(id, contributionId, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.goals.remove(id, userId);
  }
}
