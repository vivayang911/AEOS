import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, Subscription } from "rxjs";
import { DatabaseService } from "./database.service";

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly db: DatabaseService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auth = context.switchToHttp().getRequest()?.auth;
    if (!auth?.userId) return next.handle();
    return new Observable((subscriber) => {
      let subscription: Subscription | undefined;
      this.db.runWithAccessContext({ organizationId: auth.activeOrganizationId, userId: auth.userId, role: auth.role }, () => {
        subscription = next.handle().subscribe(subscriber);
      });
      return () => subscription?.unsubscribe();
    });
  }
}
