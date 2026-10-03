// gcs.ts 의 gcsUpload 미들웨어가 Multer 파일 객체에 gcsUrl 을 주입하므로
// 그 이후 핸들러에서 file.gcsUrl 로 바로 접근할 수 있도록 Express 네임스페이스 확장.
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        gcsUrl: string;
      }
    }
  }
}

export {};
