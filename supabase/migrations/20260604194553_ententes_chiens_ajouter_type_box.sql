-- Modifier la contrainte de type pour ajouter "box_compatible"
ALTER TABLE ententes_chiens 
DROP CONSTRAINT IF EXISTS ententes_chiens_type_check;

ALTER TABLE ententes_chiens 
ADD CONSTRAINT ententes_chiens_type_check 
CHECK (type IN ('positif', 'negatif', 'box_compatible'));
