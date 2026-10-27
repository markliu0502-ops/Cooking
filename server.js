import "dotenv/config";
import { app } from "./src/app.js";

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`온기 레시피 서버가 http://localhost:${port} 에서 실행 중입니다.`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
