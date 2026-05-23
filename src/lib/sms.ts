import { SolapiMessageService } from "solapi";

const messageService = new SolapiMessageService(
  process.env.SOLAPI_API_KEY!,
  process.env.SOLAPI_API_SECRET!,
);

export async function sendHappyCallSms({
  phone,
  url,
}: {
  phone: string;
  url: string;
}) {
  try {
    const result = await messageService.send({
      to: phone.replaceAll("-", ""),
      from: process.env.SOLAPI_SENDER!,
      text:
        `\n` +
        `[출장시민]\n` +
        `에어컨수리는 잘 받으셨나요?.\n\n` +
        `고객 보호와 서비스 품질관리 만족도 조사 및\n\n` +
        `★실제 결제금액★\n` +
        `★현장 응대 확인★\n` +
        `을 위해 아래링크 클릭 후 설문 부탁드립니다.\n\n` +
        `30초 정도 소요됩니다.\n` +
        `${url}\n\n` +
        `감사합니다.`,
    });

    console.log("[해피콜 문자 발송 성공]", result);

    return {
      success: true,
    };
  } catch (error) {
    console.error("[해피콜 문자 발송 실패]", error);

    return {
      success: false,
    };
  }
}