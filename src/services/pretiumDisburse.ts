import axios from 'axios';

const PRETIUM_BASE_URL = process.env.PRETIUM_API_URL!;
const PRETIUM_API_KEY = process.env.PRETIUM_API_KEY!;
const PRETIUM_CHAIN = 'BASE';
const CALLBACK_URL = `${process.env.WEBHOOK_BASE_URL}/webhooks/pretium/offramp`;

if (!PRETIUM_BASE_URL) {
  throw new Error('PRETIUM_API_URL is not set');
}

if (!PRETIUM_API_KEY) {
  throw new Error('PRETIUM_API_KEY is not set');
}

if (!process.env.WEBHOOK_BASE_URL) {
  throw new Error('WEBHOOK_BASE_URL is not set');
}

interface DisburseKesParams {
  phone: string;
  amountKes: number;
  transactionHash: string;
}

interface PretiumDisburseResponse {
  status: string;
  transaction_code: string;
  message: string;
}

export async function disburseKes({
  phone,
  amountKes,
  transactionHash,
}: DisburseKesParams): Promise<PretiumDisburseResponse> {
  // Convert phone number from 254XXXXXXXXX to 0XXXXXXXXX format
  let formattedPhone = phone;
  if (phone.startsWith('254')) {
    formattedPhone = '0' + phone.substring(3);
  }

  const requestPayload = {
    type: 'MOBILE',
    shortcode: formattedPhone,
    amount: amountKes.toString(), // Convert to string
    fee: '10', // Fee as string
    mobile_network: 'Safaricom',
    chain: PRETIUM_CHAIN,
    transaction_hash: transactionHash,
    callback_url: CALLBACK_URL,
  };

  console.log('[Pretium] Sending disbursement request:', {
    url: `${PRETIUM_BASE_URL}/v1/pay/KES`,
    phone: formattedPhone.replace(/(\d{4}).*/, '$1***'),
    amount: amountKes,
    transactionHash: transactionHash.slice(0, 10) + '...',
  });

  try {
    const response = await axios.post(
      `${PRETIUM_BASE_URL}/v1/pay/KES`,
      requestPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': PRETIUM_API_KEY,
        },
        timeout: 15000,
      }
    );

    const data = response.data;

    if (!data || data.code !== 200) {
      console.error('[Pretium] API returned non-200 code:', data);
      throw new Error(data?.message || 'Pretium disburse failed');
    }

    console.log('[Pretium] Disbursement successful:', {
      transactionCode: data.data?.transaction_code,
      status: data.data?.status,
    });

    return data.data;
  } catch (error: any) {
    console.error('[Pretium] Disbursement error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });
    throw error;
  }
}