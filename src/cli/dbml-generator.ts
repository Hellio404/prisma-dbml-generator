import { GeneratorOptions } from '@prisma/generator-helper';
import { parseEnvValue } from '@prisma/internals';
import { promises, readFileSync } from 'fs';
import { join } from 'path';
import { generateDBMLSchema } from '../generator/dbml';
import { getProjectOptions } from '../generator/project';
import {
  FieldDeclaration,
  parsePrismaSchema,
} from '@loancrate/prisma-schema-parser';

const { mkdir, writeFile } = promises;

export const defaultDBMLFileName = 'schema.dbml';

export const mappingName: any = {};

export async function generate(options: GeneratorOptions) {
  const { output, config } = options.generator;
  const outputDir = parseEnvValue(output!);
  const dbmlFileName = config.outputName || defaultDBMLFileName;

  const allowManyToMany = config.manyToMany === 'false' ? false : true;
  const useQuotesForFields = config.useQuotes === 'false' ? false : true;
  const useSnakeCase = config.snakeCase === 'false' ? false : true;
  const addNotNull = config.addNotNull === 'true' ? true : false;
  const defaultDateNow = config.defaultDateNow === 'true' ? true : false;
  const mapToDbSchema = config.mapToDbSchema === 'false' ? false : true;
  const includeRelationFields =
    config.includeRelationFields === 'false' ? false : true;

  const projectOptions = await getProjectOptions(config);
  const schemaPath = options.schemaPath;

  try {
    await mkdir(outputDir, { recursive: true });

    options.dmmf.datamodel.models.forEach((e) => {
      e.fields.forEach((f) => {
        const model_name = e.dbName || e.name;

        if (mappingName[model_name] === undefined) mappingName[model_name] = {};

        mappingName[model_name][f.name] = { name: f.dbName || f.name };
        // f.name = f.dbName || f.name;
      });
    });

    const parsed = parsePrismaSchema(
      readFileSync(schemaPath, { encoding: 'utf8' })
    );

    parsed.declarations.forEach((model) => {
      if (model.kind != 'model') return;
      const fields: FieldDeclaration[] = model.members.filter(
        (m) => m.kind == 'field'
      ) as FieldDeclaration[];

      fields.forEach((f) => {
        mappingName[model.name.value][f.name.value].dbOptions = f.attributes
          ?.filter((attr) => attr.path.value[0] == 'db')
          .map((attr) => ({ name: attr.path.value[1], args: attr.args }));
      });
    });

    const dbmlSchema = generateDBMLSchema(
      mappingName,
      options.dmmf,
	  {allowManyToMany, useQuotesForFields, useSnakeCase, addNotNull, defaultDateNow, mapToDbSchema, includeRelationFields},
      allowManyToMany,
      mapToDbSchema,
      includeRelationFields,
      projectOptions
    );

    await writeFile(join(outputDir, dbmlFileName), dbmlSchema);
  } catch (e) {
    console.error('Error: unable to write files for Prisma DBML Generator');
    throw e;
  }
}
