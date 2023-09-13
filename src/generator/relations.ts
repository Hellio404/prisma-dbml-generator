import { DMMF } from '@prisma/generator-helper';
import { snakeCase } from 'change-case';
import { getModelByType } from './model';

export const oneToOne = '-';
export const oneToMany = '<';
export const manyToOne = '>';

export function generateRelations(
  config: any,
  models: DMMF.Model[],
  mappingName: any,
  mapToDbSchema: boolean = true
): string[] {
  const refs: string[] = [];

  models.forEach((model) => {
    model.fields
      .filter(
        (field) =>
          field.relationName &&
          field.relationToFields?.length &&
          field.relationFromFields?.length
      )
      .forEach((field) => {
        const relationFrom = model.dbName || model.name;
        const relationTo = field.type;

        const relationOperator = getRelationOperator(
          models,
          relationFrom,
          relationTo
        );

        const relationFormName =
          mapToDbSchema && model.dbName ? model.dbName : model.name;

        const relationToName = mapToDbSchema
          ? getModelByType(models, relationTo)?.dbName || relationTo
          : relationTo;

        let quote = config.useQuotesForFields ? '"' : '';

		let modelNameTranformer = config.useSnakeCase ? snakeCase : (name: string) => name;

        const ref = `Ref: ${quote}${modelNameTranformer(
          relationFormName
        )}${quote}.${combineKeys(
          field.relationFromFields!.map(
            (e) => mappingName[relationFormName][e].name
          ),
          quote
        )} ${relationOperator} ${quote}${modelNameTranformer(relationToName)}${quote}.${combineKeys(
          field.relationToFields!.map(
            (e) => mappingName[relationToName][e].name
          ),
          quote
        )}`;

        const referentialActions = getReferentialActions(
          models,
          relationFrom,
          relationTo
        );

        refs.push(`${ref}${referentialActions}`);
      });
  });
  return refs;
}

const getRelationOperator = (
  models: DMMF.Model[],
  from: string,
  to: string
): string => {
  const model = models.find((model) => model.name === to);
  const field = model?.fields.find((field) => field.type === from);
  return field?.isList ? manyToOne : oneToOne;
};

// Composite foreign keys:
// Ref: merchant_periods.(merchant_id, country_code) > merchants.(id, country_code)
const combineKeys = (keys: string[], quote: string): string => {
  return keys.length > 1
    ? `(${keys.map((key) => `${quote}${key}${quote}`).join(', ')})`
    : `${quote}${keys[0]}${quote}`;
};

const getReferentialActions = (
  models: DMMF.Model[],
  from: string,
  to: string
): string => {
  const model = models.find((model) => model.name === from);
  const field = model?.fields.find((field) => field.type === to);
  const referentialActions: string[] = [];

  if (
    field?.relationOnDelete &&
    (referentialActionsMap.get(field.relationOnDelete) ||
      field.relationOnDelete) != 'No Action'
  ) {
    referentialActions.push(
      `delete: ${
        referentialActionsMap.get(field.relationOnDelete) ||
        field.relationOnDelete
      }`
    );
  }

  if (referentialActions.length) {
    return ' [' + referentialActions.join(', ') + ']';
  }
  return '';
};

enum ReferentialAction {
  Cascade = 'Cascade',
  Restrict = 'Restrict',
  NoAction = 'No Action',
  SetNull = 'Set Null',
  SetDefault = 'Set Default',
}

const referentialEntries = Object.entries(ReferentialAction);
const referentialActionsMap = new Map(referentialEntries);
