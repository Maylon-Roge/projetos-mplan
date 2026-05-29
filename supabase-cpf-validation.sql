-- ============================================
-- VALIDAÇÃO DE CPF/CNPJ NO BANCO (TRIGGER)
-- ============================================

-- Função que valida CPF
CREATE OR REPLACE FUNCTION validar_cpf_banco(cpf TEXT) RETURNS BOOLEAN AS $$
DECLARE
    digitos TEXT;
    soma INT;
    resto INT;
BEGIN
    digitos := regexp_replace(cpf, '[^0-9]', '', 'g');
    IF length(digitos) != 11 THEN RETURN FALSE; END IF;

    -- Rejeita sequências repetidas (111.111.111-11)
    IF digitos ~ '^(\d)\1{10}$' THEN RETURN FALSE; END IF;

    -- 1º dígito verificador
    soma := 0;
    FOR i IN 0..8 LOOP
        soma := soma + (substr(digitos, i+1, 1)::INT) * (10 - i);
    END LOOP;
    resto := (soma * 10) % 11;
    IF resto = 10 THEN resto := 0; END IF;
    IF resto != substr(digitos, 10, 1)::INT THEN RETURN FALSE; END IF;

    -- 2º dígito verificador
    soma := 0;
    FOR i IN 0..9 LOOP
        soma := soma + (substr(digitos, i+1, 1)::INT) * (11 - i);
    END LOOP;
    resto := (soma * 10) % 11;
    IF resto = 10 THEN resto := 0; END IF;
    IF resto != substr(digitos, 11, 1)::INT THEN RETURN FALSE; END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


-- Função que valida CNPJ
CREATE OR REPLACE FUNCTION validar_cnpj_banco(cnpj TEXT) RETURNS BOOLEAN AS $$
DECLARE
    digitos TEXT;
    soma INT;
    resto INT;
BEGIN
    digitos := regexp_replace(cnpj, '[^0-9]', '', 'g');
    IF length(digitos) != 14 THEN RETURN FALSE; END IF;
    IF digitos ~ '^(\d)\1{13}$' THEN RETURN FALSE; END IF;

    -- 1º dígito verificador
    soma := 0;
    FOR i IN 1..12 LOOP
        CASE i
            WHEN 1 THEN soma := soma + (substr(digitos, i, 1)::INT) * 5;
            WHEN 2 THEN soma := soma + (substr(digitos, i, 1)::INT) * 4;
            WHEN 3 THEN soma := soma + (substr(digitos, i, 1)::INT) * 3;
            WHEN 4 THEN soma := soma + (substr(digitos, i, 1)::INT) * 2;
            WHEN 5 THEN soma := soma + (substr(digitos, i, 1)::INT) * 9;
            WHEN 6 THEN soma := soma + (substr(digitos, i, 1)::INT) * 8;
            WHEN 7 THEN soma := soma + (substr(digitos, i, 1)::INT) * 7;
            WHEN 8 THEN soma := soma + (substr(digitos, i, 1)::INT) * 6;
            WHEN 9 THEN soma := soma + (substr(digitos, i, 1)::INT) * 5;
            WHEN 10 THEN soma := soma + (substr(digitos, i, 1)::INT) * 4;
            WHEN 11 THEN soma := soma + (substr(digitos, i, 1)::INT) * 3;
            WHEN 12 THEN soma := soma + (substr(digitos, i, 1)::INT) * 2;
        END CASE;
    END LOOP;
    resto := soma % 11;
    IF resto < 2 THEN resto := 0; ELSE resto := 11 - resto; END IF;
    IF resto != substr(digitos, 13, 1)::INT THEN RETURN FALSE; END IF;

    -- 2º dígito verificador
    soma := 0;
    FOR i IN 1..13 LOOP
        CASE i
            WHEN 1 THEN soma := soma + (substr(digitos, i, 1)::INT) * 6;
            WHEN 2 THEN soma := soma + (substr(digitos, i, 1)::INT) * 5;
            WHEN 3 THEN soma := soma + (substr(digitos, i, 1)::INT) * 4;
            WHEN 4 THEN soma := soma + (substr(digitos, i, 1)::INT) * 3;
            WHEN 5 THEN soma := soma + (substr(digitos, i, 1)::INT) * 2;
            WHEN 6 THEN soma := soma + (substr(digitos, i, 1)::INT) * 9;
            WHEN 7 THEN soma := soma + (substr(digitos, i, 1)::INT) * 8;
            WHEN 8 THEN soma := soma + (substr(digitos, i, 1)::INT) * 7;
            WHEN 9 THEN soma := soma + (substr(digitos, i, 1)::INT) * 6;
            WHEN 10 THEN soma := soma + (substr(digitos, i, 1)::INT) * 5;
            WHEN 11 THEN soma := soma + (substr(digitos, i, 1)::INT) * 4;
            WHEN 12 THEN soma := soma + (substr(digitos, i, 1)::INT) * 3;
            WHEN 13 THEN soma := soma + (substr(digitos, i, 1)::INT) * 2;
        END CASE;
    END LOOP;
    resto := soma % 11;
    IF resto < 2 THEN resto := 0; ELSE resto := 11 - resto; END IF;
    IF resto != substr(digitos, 14, 1)::INT THEN RETURN FALSE; END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


-- Trigger que une as duas validações
CREATE OR REPLACE FUNCTION trigger_validar_documento()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo_documento = 'cpf' THEN
        IF NOT validar_cpf_banco(NEW.documento) THEN
            RAISE EXCEPTION 'CPF inválido: %', NEW.documento;
        END IF;
    ELSIF NEW.tipo_documento = 'cnpj' THEN
        IF NOT validar_cnpj_banco(NEW.documento) THEN
            RAISE EXCEPTION 'CNPJ inválido: %', NEW.documento;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Remove trigger antigo (se existir) e aplica o novo
DROP TRIGGER IF EXISTS valida_documento ON participantes;
CREATE TRIGGER valida_documento
    BEFORE INSERT ON participantes
    FOR EACH ROW
    EXECUTE FUNCTION trigger_validar_documento();
