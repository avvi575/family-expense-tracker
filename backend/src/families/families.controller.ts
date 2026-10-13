import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FamiliesService } from './families.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CreateFamilyDto, InviteMemberDto, JoinFamilyDto } from './families.dto';

@Controller('families')
export class FamiliesController {
  constructor(private families: FamiliesService) {}

  /** Public: preview an invite before accepting (no auth). */
  @Get('invites/:token')
  inviteInfo(@Param('token') token: string) {
    return this.families.inviteInfo(token);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateFamilyDto) {
    return this.families.create(userId, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser('id') userId: string) {
    return this.families.myFamilies(userId);
  }

  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  members(@Param('id') familyId: string, @CurrentUser('id') userId: string) {
    return this.families.members(familyId, userId);
  }

  @Post(':id/invite')
  @UseGuards(JwtAuthGuard)
  invite(
    @Param('id') familyId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.families.invite(familyId, userId, dto);
  }

  @Post('join')
  @UseGuards(JwtAuthGuard)
  join(@CurrentUser('id') userId: string, @Body() dto: JoinFamilyDto) {
    return this.families.join(userId, dto);
  }
}
