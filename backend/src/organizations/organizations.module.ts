import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './organization.entity';
import { Invitation } from './invitation.entity';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { InvitationsController } from './invitations.controller';
import { User } from '../users/user.entity';
import { ChatRoom } from '../chat/entities/chat-room.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Invitation, User, ChatRoom]),
    MailModule,
  ],
  providers: [OrganizationsService],
  controllers: [OrganizationsController, InvitationsController],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
