import "reflect-metadata";
import { config as loadEnvironment } from "dotenv";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { HttpErrorFilter } from "./http-error.filter";
import { allowedWebOrigins, apiSecurityHeaders } from "./security-headers";

loadEnvironment({path:resolve(__dirname,"../../../.env"),override:false,quiet:true});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpErrorFilter());
  app.use((_request:any,response:any,next:()=>void)=>{for(const [name,value] of Object.entries(apiSecurityHeaders(process.env.NODE_ENV==="production")))response.setHeader(name,value);next()});
  app.enableCors({ origin: allowedWebOrigins(), credentials: true });
  await app.listen(Number(process.env.API_PORT ?? 4000));
}
void bootstrap();
