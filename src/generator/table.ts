import { DBMLKeywords, PrismaScalars } from './../keywords';
import { DMMF } from '@prisma/generator-helper';
import { getModelByType } from './model';
import { snakeCase } from 'change-case';

export function generateTables(
  config: any,
  models: DMMF.Model[],
  mappingName: any,
  mapToDbSchema: boolean = false,
  includeRelationFields: boolean = true
): string[] {
  return models.map((model) => {
    let modelName = model.name;

    if (mapToDbSchema && model.dbName) {
      modelName = model.dbName;
    }

    let modelNameTranformed = config.useSnakeCase
      ? snakeCase(modelName)
      : modelName;
    let quote = config.useQuotesForFields ? '"' : '';

    return (
      `${DBMLKeywords.Table} ${quote}${modelNameTranformed}${quote} {\n` +
      generateFields(
        config,
        model.fields,
        models,
        modelName,
        mappingName,
        mapToDbSchema,
        includeRelationFields
      ) +
      generateTableIndexes(model, mappingName) +
      generateTableDocumentation(model) +
      '\n}'
    );
  });
}

const generateTableIndexes = (model: DMMF.Model, mappingName: any): string => {
  const primaryFields = model.primaryKey?.fields;
  const hasIdFields = primaryFields && primaryFields.length > 0;
  const hasCompositeUniqueIndex = hasCompositeUniqueIndices(model.uniqueFields);
  return hasIdFields || hasCompositeUniqueIndex
    ? `\n\n  ${DBMLKeywords.Indexes} {\n${generateTableBlockId(
        model.dbName || model.name,
        mappingName,
        primaryFields
      )}${
        hasIdFields && hasCompositeUniqueIndex ? '\n' : ''
      }${generateTableCompositeUniqueIndex(
        model.dbName || model.name,
        mappingName,
        model.uniqueFields
      )}\n  }`
    : '';
};

const hasCompositeUniqueIndices = (uniqueFields: string[][]): boolean => {
  return uniqueFields.filter((composite) => composite.length > 1).length > 0;
};

const generateTableBlockId = (
  modelName: string,
  mappingName: any,
  primaryFields: string[] | undefined
): string => {
  if (primaryFields === undefined || primaryFields.length === 0) {
    return '';
  }
  return `    (${primaryFields
    .map((e) => mappingName[modelName][e].name)
    .join(', ')}) [${DBMLKeywords.Pk}]`;
};

const generateTableCompositeUniqueIndex = (
  modelName: string,
  mappingName: any,
  uniqueFields: string[][]
): string => {
  return uniqueFields
    .filter((composite) => composite.length > 1)
    .map(
      (composite) =>
        `    (${composite
          .map((e) => mappingName[modelName][e].name)
          .join(', ')}) [${DBMLKeywords.Unique}]`
    )
    .join('\n');
};

const generateTableDocumentation = (model: DMMF.Model): string => {
  const doc = model.documentation?.replace(/'/g, "\\'");
  return doc ? `\n\n  Note: '${doc}'` : '';
};

const mappingType: any = {
  String: 'VARCHAR(255)',
  DateTime: 'DATETIME',
  Int: 'INT',
  Boolean: 'TINYINT(1)',
};

const generateFields = (
  config: any,
  fields: DMMF.Field[],
  models: DMMF.Model[],
  modelName: string,
  mappingName: any,
  mapToDbSchema: boolean = false,
  includeRelationFields: boolean = true
): string => {
  if (!includeRelationFields) {
    fields = fields.filter((field) => !field.relationName);
  }

  return fields
    .map((field) => {
      const relationToName = mapToDbSchema
        ? getModelByType(models, field.type)?.dbName || field.type
        : field.type;

      let fieldType = relationToName;

      fieldType = mappingType[fieldType];
      switch (mappingName[modelName][field.name].dbOptions[0]?.name) {
        case 'Text':
          fieldType = 'TEXT';
          break;
        case 'VarChar':
          const value =
            mappingName[modelName][field.name].dbOptions[0].args[0]?.value;
          if (value) {
            fieldType = `VARCHAR(${value})`;
          }
          break;
        default:
          if (mappingName[modelName][field.name].dbOptions.length > 0)
            console.log(
              `unkown @db.(${mappingName[modelName][field.name].dbOptions
                .map((e: any) => e.name)
                .join(', ')})`
            );
          break;
      }
      if (!fieldType) fieldType = relationToName;

      fieldType =
        field.isList && !field.relationName ? `${fieldType}[]` : fieldType;
      const quote = config.useQuotesForFields ? '"' : '';
      return `  ${quote}${
        field.dbName || field.name
      }${quote} ${fieldType}${generateColumnDefinition(config, field)}`;
    })
    .join('\n');
};

const generateColumnDefinition = (config: any, field: DMMF.Field): string => {
  const columnDefinition: string[] = [];
  if (field.isId) {
    columnDefinition.push(DBMLKeywords.Pk);
  }

  if ((field.default as DMMF.FieldDefault)?.name === 'autoincrement') {
    columnDefinition.push(DBMLKeywords.Increment);
  }

  if (
    config.defaultDateNow &&
    (field.default as DMMF.FieldDefault)?.name === 'now'
  ) {
    columnDefinition.push('default: `now()`');
  }

  if (field.isUnique) {
    columnDefinition.push(DBMLKeywords.Unique);
  }

  if (config.addNotNull && field.isRequired && !field.isId) {
    columnDefinition.push(DBMLKeywords.NotNull);
  }

  if (field.hasDefaultValue && typeof field.default != 'object') {
    if (
      field.type === PrismaScalars.String ||
      field.type === PrismaScalars.Json ||
      field.kind === 'enum'
    ) {
      columnDefinition.push(`${DBMLKeywords.Default}: '${field.default}'`);
    } else if (field.type === PrismaScalars.Boolean) {
      columnDefinition.push(
        `${DBMLKeywords.Default}: ${field.default ? 1 : 0}`
      );
    } else {
      columnDefinition.push(`${DBMLKeywords.Default}: ${field.default}`);
    }
  } else if (field.hasDefaultValue && (field.default as any)?.name == 'cuid') {
    columnDefinition.push(`${DBMLKeywords.Default}: "cuid()"`);
  }
  if (field.documentation) {
    columnDefinition.push(
      `${DBMLKeywords.Note}: '${field.documentation.replace(/'/g, "\\'")}'`
    );
  }

  if (columnDefinition.length) {
    return ' [' + columnDefinition.join(', ') + ']';
  }
  return '';
};
