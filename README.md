# 온기 레시피

한국어 개인 요리 레시피 앱입니다. 프런트엔드는 바닐라 HTML/CSS/JavaScript, API는 Node.js 24와 Express, 데이터베이스는 Neon PostgreSQL을 사용합니다. 로컬에서는 Express가 `public/` 화면 파일을 제공하고, Vercel에서는 `public/` 파일을 CDN이 제공하며 Express는 API를 처리합니다. 브라우저에 `DATABASE_URL`을 보내지 않습니다.

## 주요 기능

- 레시피 등록·목록·상세 조회·수정
- 식재료의 이름·분량·손질 방법, 양념, 필요한 도구 저장
- 섹션과 세부 단계 추가·삭제·순서 변경 및 섹션 접기·펼치기
- 단계별 불 세기 `해당 없음(null)`, `0: 불 끔`부터 `5: 강불`
- 한국어 반응형 화면, 요청 중·성공·오류 안내, 사용자 입력을 일반 텍스트로 표시
- 관련 레시피 데이터의 PostgreSQL 트랜잭션 저장

## 사전 준비

- Node.js 24.x와 npm
- Neon 계정 및 PostgreSQL 프로젝트
- VS Code (선택)

## 로컬 실행

VS Code에서 이 폴더를 열고 터미널을 실행합니다.

```powershell
npm ci
Copy-Item .env.example .env
```

`.env`를 편집해 Neon에서 복사한 **pooled connection string**을 `DATABASE_URL`에 입력합니다. 비밀 값은 소스 코드나 채팅에 넣지 말고 로컬 `.env` 또는 서비스의 환경변수 화면에서만 설정하세요. `.env`는 Git에서 제외됩니다. `.env.example`은 값의 형식만 보여주는 예시입니다.

최초 1회 스키마를 생성한 뒤 앱을 실행합니다.

```powershell
npm run db:migrate
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다. `npm start`로 일반 로컬 서버를 실행할 수도 있습니다. 앱 시작은 데이터베이스나 샘플 데이터를 초기화하지 않습니다.

예시 데이터가 필요할 때에만 별도로 실행합니다.

```powershell
npm run db:seed
```

## 기존 SQLite 데이터 이전

현재 프로젝트의 `recipes.db`에는 기존 레시피가 있습니다. 앱은 이 파일을 변경하거나 삭제하지 않습니다. 이 프로젝트 전환 전에 `recipes.pre-neon-20261028-035946.sqlite3.bak` 백업을 만들어 두었습니다. 본인의 파일과 백업이 존재하는지 확인하고 별도 안전한 위치에도 복사해 두세요.

`DATABASE_URL`이 `.env`에 설정되어 있고, 대상 Neon 데이터베이스에 마이그레이션이 적용된 상태에서 실행합니다.

```powershell
npm run db:migrate
npm run data:import -- --sqlite .\recipes.db
npm run data:import:check -- --sqlite .\recipes.db
```

기본 SQLite 파일을 사용할 때는 `--sqlite` 인자를 생략할 수 있습니다. 스크립트는 SQLite를 읽기 전용으로 열고, 레시피와 각 연결 데이터의 순서·손질 방법·도구·불 세기를 PostgreSQL에 복사한 뒤 개수와 연결 정보를 비교합니다. SQLite ID를 결정적 UUID로 변환하고 `ON CONFLICT DO NOTHING`을 사용하므로 재실행해도 같은 데이터를 중복 생성하지 않습니다. 검증이 실패하면 원본 SQLite 및 백업을 보존하고 원인을 확인하세요. 기존 파일은 자동 삭제되지 않습니다.

데이터 이전이 끝나기 전에는 앱에 운영용 Neon URL을 연결하거나 SQLite 파일을 삭제하지 마세요. 프로젝트에 실제 Neon 접속 자격 증명이 제공되지 않아 이 환경에서는 원격 데이터 이전을 실행하지 않았습니다.

## Neon 설정

1. [Neon Console](https://console.neon.tech/)에서 프로젝트와 PostgreSQL 데이터베이스를 만듭니다.
2. **Connect**에서 연결 문자열을 복사합니다. Vercel 함수 연결에는 Neon의 **pooled connection**을 선택하세요.
3. 문자열을 `DATABASE_URL` 환경변수에 설정합니다. 서버 전용 이름을 사용하며 `NEXT_PUBLIC_` 또는 브라우저 번들 설정에 넣지 않습니다.
4. `npm run db:migrate`를 실행해 버전이 기록되는 스키마 마이그레이션을 적용합니다. 마이그레이션 명령은 재실행할 수 있습니다.

Neon 연결 방식과 HTTP 트랜잭션: [Neon Serverless Driver 문서](https://neon.com/docs/serverless/serverless-driver).

## GitHub 및 Vercel 배포

저장소에 사용자 데이터나 자격 증명을 넣지 않도록 `.env`, `node_modules`, SQLite DB·백업 파일을 `.gitignore`에 포함했습니다. **현재 실행 환경에는 Git CLI와 Git 저장소가 확인되지 않아 GitHub 커밋·업로드는 수행하지 않았습니다.** Git을 설치하고 GitHub에서 비공개 저장소를 만든 뒤, VS Code의 Source Control에서 변경 파일을 검토하고 커밋·푸시하세요. SQLite 데이터베이스와 백업 파일이 스테이징되지 않았는지 반드시 확인합니다.

Vercel의 공식 Express 통합은 프로젝트 루트의 Express 앱(`index.js`)을 기본 내보내면 자동 감지합니다. 정적 파일은 `public/`에 두어 Vercel CDN에서 제공하고, Vercel에서는 `express.static()`이 정적 파일을 제공하지 않습니다. 이 프로젝트는 해당 디렉터리를 사용하며 별도 프런트엔드 프레임워크나 라우팅 재작성 설정은 필요하지 않습니다. Vercel 대시보드에서 GitHub 저장소를 가져옵니다.

1. Vercel 프로젝트의 **Settings → Environment Variables**에서 `DATABASE_URL`을 설정합니다. `Production`에는 운영 Neon 브랜치 URL을 넣습니다.
2. **Preview**에는 운영 DB와 분리된 Neon 개발/Preview 브랜치의 pooled URL을 별도로 설정합니다. Preview 배포가 실제 사용자 데이터를 변경하지 않는지 확인합니다. Development 변수도 필요하면 별도 설정합니다.
3. **Production 및 Preview 도메인 공개 전** **Settings → Deployment Protection**에서 Vercel Authentication 보호를 켭니다. Vercel 공식 문서상 모든 요금제에서 사용 가능하며 팀 계정 또는 허용된 공유 링크로 접근을 제한할 수 있습니다. 각 환경과 사용자 지정 도메인의 보호가 실제로 적용됐는지 직접 확인하세요.
4. 자격 증명은 채팅이나 GitHub 코드로 전달하지 말고, Neon 및 Vercel 콘솔에서 직접 설정합니다.

이 앱 자체에는 회원가입·로그인 기능이 없습니다. Vercel 배포 보호가 해제된 주소나 보호 우회 링크를 공개하면 방문자가 레시피를 읽거나 수정할 수 있습니다. 보호 설정을 확인하기 전에는 운영 주소를 외부에 공개하지 마세요.

- [Vercel Express 배포 문서](https://vercel.com/docs/frameworks/backend/express)
- [Vercel 배포 보호 방식](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments)

## 검사 명령

```powershell
npm test
npm run db:migrate
npm run data:import -- --sqlite .\recipes.db
npm run data:import:check -- --sqlite .\recipes.db
```

테스트는 API의 등록·목록·상세·수정, 수정 후 연결 데이터 중복 방지, 섹션·단계 순서, 불 세기 `null`/`0`, 서버 검증, 데이터베이스 오류 응답, 한국어 정적 화면을 확인합니다. Neon에 실제 연결해 수행하는 스키마 적용과 SQLite 이전 검증은 유효한 환경변수가 필요합니다.

## VS Code에서 개발

1. VS Code로 폴더를 열고 Node.js 24.x가 선택됐는지 확인합니다 (`.nvmrc` 및 `package.json`의 `engines` 참고).
2. 통합 터미널에서 `npm ci`를 실행합니다.
3. 로컬 `.env`에 `DATABASE_URL`을 설정한 뒤 최초 한 번 `npm run db:migrate`를 실행합니다.
4. `npm run dev`로 서버를 시작하고, 변경 사항은 브라우저에서 확인합니다.
5. `npm test`를 실행합니다. Neon 연결이 필요한 이전 테스트는 별도 DB branch에서 실행합니다.
