import { AuthRepository } from '../repositories/auth_repository';
import { AuthResponse } from '../entities/user';

export class GuestLoginUseCase {
  constructor(private repository: AuthRepository) {}

  async execute(deviceInfo: any): Promise<AuthResponse> {
    return await this.repository.guestLogin(deviceInfo);
  }
}

export class CheckLoginUseCase {
  constructor(private repository: AuthRepository) {}

  async execute(): Promise<boolean> {
    return await this.repository.isUserLoggedIn();
  }
}

export class LogoutUseCase {
  constructor(private repository: AuthRepository) {}

  async execute(): Promise<void> {
    await this.repository.logout();
  }
}
