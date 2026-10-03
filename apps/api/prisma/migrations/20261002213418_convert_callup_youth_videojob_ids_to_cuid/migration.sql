-- AlterEnum
ALTER TYPE "PlayerStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "PlayerCallup" DROP CONSTRAINT "PlayerCallup_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "PlayerCallup_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "PlayerCallup_id_seq";

-- AlterTable
ALTER TABLE "VideoAnalysisJob" DROP CONSTRAINT "VideoAnalysisJob_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "VideoAnalysisJob_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "VideoAnalysisJob_id_seq";

-- AlterTable
ALTER TABLE "YouthRegistration" DROP CONSTRAINT "YouthRegistration_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "YouthRegistration_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "YouthRegistration_id_seq";
