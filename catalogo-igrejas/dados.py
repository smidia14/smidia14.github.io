"""Dados das igrejas tirados do Word "Lista das igrejas com endereço e foto - Brasil 2026.docx".
Fotos: imagens do Word (nome dentro de word/media), a primeira é a principal."""

# Horário padrão de todas as igrejas (o mesmo das transmissões do site, só o início).
# Se alguma igreja for diferente, a secretaria corrige na planilha.
HORARIO_PADRAO = "Dom e Qua 19h30 · Sáb 9h30"

IGREJAS = [
    # id, nome, cidade, UF, estado, endereço, CEP, fotos, observação
    ("curitiba", "Curitiba", "Curitiba", "PR", "Paraná", "Rua Sebastião Lima, 217 – Alto do Boqueirão", "81850-550", ["image3"], ""),
    ("camboriu", "Camboriú", "Camboriú", "SC", "Santa Catarina", "Rua Pingo de Ouro, 96 – Monte Alegre", "88340-000", ["image5", "image4"], ""),
    ("vila-re", "Vila Ré", "São Paulo", "SP", "São Paulo", "Rua Santo Henrique, 73 – Vila Ré", "03664-010", ["image7", "image6"], ""),
    ("guarulhos", "Guarulhos", "Guarulhos", "SP", "São Paulo", "Rua Pinhão, 127 – Jardim Santa Maria", "07273-220", ["image8"], ""),
    ("piracicaba", "Piracicaba", "Piracicaba", "SP", "São Paulo", "Rua Virgílio Furlan, 1097 – Paulicéia", "13424-080", ["image9", "image10", "image11"], ""),
    ("itaim-paulista", "Itaim Paulista", "São Paulo", "SP", "São Paulo", "", "", [], "Falta endereço, CEP e foto."),
    ("belo-horizonte", "Belo Horizonte", "Belo Horizonte", "MG", "Minas Gerais", "Rua Rômulo Bressane Lopes, 45 – Parque São José", "30570-560", ["image12"], ""),
    ("juiz-de-fora", "Juiz de Fora", "Juiz de Fora", "MG", "Minas Gerais", "Rua Poeta Daltemar Lima, 350 – Encosta do Sol (Francisco Bernardino)", "36083-015", ["image13"], ""),
    ("ouro-fino", "Ouro Fino", "Ouro Fino", "MG", "Minas Gerais", "Jaci Pereira de Andrade, 200 – Jardim São Paulo", "37570-000", ["image14"], "Confirmar se é Rua ou Avenida."),
    ("realengo", "Realengo", "Rio de Janeiro", "RJ", "Rio de Janeiro", "Rua Luiza Barata, 336 – Realengo", "21770-230", ["image15"], "Só tem foto de dentro. Uma foto da fachada ajudaria."),
    ("paraty", "Paraty", "Paraty", "RJ", "Rio de Janeiro", "", "", ["image16"], "Falta endereço e CEP."),
    ("manaus", "Manaus", "Manaus", "AM", "Amazonas", "Rua Belford Roxo, 539 – Jorge Teixeira", "69088-139", ["image17", "image18"], ""),
    ("valenca-ba", "Valença", "Valença", "BA", "Bahia", "Rua Caminho Três, 9b – Urbis", "45400-000", ["image19", "image20"], ""),
    ("capela", "Capela", "Valença", "BA", "Bahia", "Capela de São José – Orobó (zona rural), s/n", "45400-000", ["image21", "image22"], ""),
    ("colonia", "Colônia", "Valença", "BA", "Bahia", "Região do Orobó (zona rural), s/n", "45400-000", ["image23"], ""),
    ("gandu", "Gandu", "Gandu", "BA", "Bahia", "Rua Antônio César de Almeida, 140 – São Serafim", "45450-000", ["image24"], ""),
    ("jequie", "Jequié", "Jequié", "BA", "Bahia", "Rua Leur Brito, 269 – Joaquim Romão", "45200-523", ["image26", "image25"], ""),
    ("barra-da-estiva", "Barra da Estiva", "Barra da Estiva", "BA", "Bahia", "BA-142, SI Barro Duro, 50-A – Zona rural Pé do Morro", "46650-000", ["image27", "image28"], "Confirmar o que significa \"SI\" (Sítio?). Só tem fotos de dentro."),
    ("placas", "Placas", "Iramaia", "BA", "Bahia", "Povoado de Cruzlândia", "46770-000", ["image30", "image29"], "Só tem fotos de dentro."),
    ("vitoria-da-conquista", "Vitória da Conquista", "Vitória da Conquista", "BA", "Bahia", "", "", ["image31"], "Falta endereço e CEP."),
    ("valenca-pi", "Valença do Piauí", "Valença do Piauí", "PI", "Piauí", "Rua General Propício de Castro, 955 – Valentin", "64300-000", ["image32", "image33"], ""),
    ("campina-grande", "Campina Grande", "Campina Grande", "PB", "Paraíba", "Rua Severino Francisco dos Santos, 212 – Malvinas", "58434-627", ["image35", "image36", "image34"], ""),
    ("princesa-isabel", "Princesa Isabel", "Princesa Isabel", "PB", "Paraíba", "Rua Alfredo Carlos da Costa (em frente ao SAMU)", "58755-000", ["image37", "image38"], "Só tem fotos de dentro."),
]
