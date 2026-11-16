// Onde os dados do sistema ficam.
// Vazio (null) = nuvem, nos servidores do Supabase em São Paulo (padrão).
// Para usar um servidor próprio da empresa, o instalador (pasta instalador/) grava aqui a URL e a chave pública (anon) dele:
//   window.AGROCEL_CONFIG = {url: "http://servidor:8080/api", key: "eyJ...", nome: "servidor da empresa"};
// A chave pública pode ficar neste arquivo. Nunca coloque aqui a chave de serviço (service_role).
window.AGROCEL_CONFIG = null;
