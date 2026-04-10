const CryptoJS = require('crypto-js');

const KEY = process.env.ENCRYPTION_KEY || 'chave_padrao_dev_32chars_inseguro';

/**
 * Criptografa template facial (vetor float32) antes de salvar no banco.
 * LGPD: dados biométricos devem ser protegidos com AES-256.
 */
function encryptFacialTemplate(descriptorArray) {
  if (!descriptorArray) return null;
  const json = JSON.stringify(Array.from(descriptorArray));
  return CryptoJS.AES.encrypt(json, KEY).toString();
}

function decryptFacialTemplate(encrypted) {
  if (!encrypted) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, KEY);
    const json = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

module.exports = { encryptFacialTemplate, decryptFacialTemplate };
