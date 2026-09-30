import { Role } from "../../src/generated/enums"
import { generateTokens } from "../../src/lib/token"

describe("토큰 테스트", ()=>{
    test("인증된 토큰이 생성 되었다면, 인증된 토큰값들 리턴", async () => {
       const result = generateTokens({ id: "00000000-0000-4000-8000-000000000001", role: Role.ADMIN })
        expect(result.accessToken).toBeDefined()
        expect(result.refreshToken).toBeDefined()
    })
   
})