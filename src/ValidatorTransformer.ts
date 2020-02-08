import {
  DirectiveNode,
  FieldDefinitionNode,
  ArgumentNode,
  InterfaceTypeDefinitionNode,
  NamedTypeNode,
  ObjectTypeDefinitionNode,
  StringValueNode
} from 'graphql';
import { iff, ifElse, printBlock, qref, raw, set, ref, newline, QuietReferenceNode, RawNode } from 'graphql-mapping-template';
import { ResolverResourceIDs } from 'graphql-transformer-common';
import {
  gql,
  InvalidDirectiveError,
  Transformer,
  TransformerContext
} from 'graphql-transformer-core';
import { ReferenceNode } from 'graphql-mapping-template/lib';


enum FilterName {
  default = "default",
  lowercase = "lowercase",
  uppercase = "uppercase",
  lcFirst = "lcFirst",
  ucFirst = "ucFirst",
  trim = "trim"
}
enum ValidatorName {
  filter = "filter",
  required = "required",
  regex = "regex",
  number = "number",
  string = "string",
  boolean = "boolean",
  url = "url",
  email = "email",
  in = "in"
}
interface ValidatorDirective {
  readonly type: ValidatorName;
  readonly filter?: FilterName;
  readonly expression?: string;
  readonly arrayString?: Array<string>;
  readonly arrayInteger?: Array<number>;
  readonly arrayFloat?: Array<number>;
  readonly valueString?: string;
  readonly valueInteger?: number;
  readonly valueFloat?: number;
  readonly valueBoolean?: boolean;
  readonly min?: number;
  readonly max?: number;
}

export default class ValidatorTransformer extends Transformer {
  constructor() {
    super(
      'ValidatorTransformer',
      gql`
        directive @validator(
          type: ValidatorName!,
          filter: FilterName,
          expression: String,
          arrayString: [String],
          arrayInt: [Int],
          arrayFloat: [Float],
          valueString: String,
          valueInt: Int,
          valueFloat: Float,
          valueBoolean: Boolean,
          min: Int,
          max: Int,
        ) on FIELD_DEFINITION
        enum FilterName { default lowercase uppercase lcFirst ucFirst trim }
        enum ValidatorName { filter required regex number integer float string boolean url email in }
      `
    );
  }

  public field = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    definition: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext
  ): void => {
    const typeName: string = parent.name.value;
    const fieldName: string = definition.name.value;

    this.assertModelDirective(parent.directives);

    let snippet: string;

    const args = this.parseArguments(directive.arguments);
    switch (args.type) {
      case ValidatorName.filter:
        snippet = this.createFilterVTLSnippet(fieldName,  (definition.type as NamedTypeNode).name.value, args);
        break;
      case ValidatorName.required:
        snippet = this.createRequiredVTLSnippet(fieldName);
        break;
      case ValidatorName.number:
        snippet = this.createNumberVTLSnippet(fieldName);
        break;
      case ValidatorName.boolean:
        snippet = this.createBooleanVTLSnippet(fieldName);
        break;
      case ValidatorName.string:
        snippet = this.createStringVTLSnippet(fieldName);
        break;
      case ValidatorName.regex:
        snippet = this.createRegexVTLSnippet(fieldName, args.expression);
        break;
      case ValidatorName.url:
        snippet = this.createUrlVTLSnippet(fieldName, args.expression);
        break;
      case ValidatorName.email:
        snippet = this.createEmailVTLSnippet(fieldName, args.expression);
        break;
      case ValidatorName.in:
        snippet = this.createInVTLSnippet(fieldName,  (definition.type as NamedTypeNode).name.value, args);
        break;
      default:
        throw new InvalidDirectiveError('Invalid validator type.');
    }

    this.augmentMutations(ctx, typeName, snippet);
  };

  private createInVTLSnippet = (fieldName: string, fieldType: string, args: ValidatorDirective): string => {
    let ifExpression: RawNode;
    let setArrayBlock: string;
    const refName = `${fieldName}Arr`;
    const refVar: ReferenceNode = ref(refName);
    switch (fieldType) {
      case 'String':
        if (typeof args.arrayString === 'undefined') {
          throw new InvalidDirectiveError('arrayString must be defined.');
        }
        setArrayBlock = printBlock(`Set filter array variable for "${fieldName}"`)(
          set(refVar, raw(JSON.stringify(args.arrayString)))
        );
        ifExpression = raw(`!$${refName}.includes($ctx.args.input.${fieldName})`);
        break;
      case 'Int':
        if (typeof args.arrayInteger === 'undefined') {
          throw new InvalidDirectiveError('arrayInteger must be defined.');
        }
        setArrayBlock = printBlock(`Set filter array variable for "${fieldName}"`)(
          set(refVar, raw(JSON.stringify(args.arrayInteger)))
        );
        ifExpression = raw(`!$${refName}.includes($ctx.args.input.${fieldName})`);
        break;
      case 'Float':
        if (typeof args.arrayFloat === 'undefined') {
          throw new InvalidDirectiveError('arrayFloat must be defined.');
        }
        setArrayBlock = printBlock(`Set filter array variable for "${fieldName}"`)(
          set(refVar, raw(JSON.stringify(args.arrayFloat)))
        );
        ifExpression = raw(`!$${refName}.includes($ctx.args.input.${fieldName})`);
        break;
      default:
        throw new InvalidDirectiveError('Unexpected field type.');
    }
    return setArrayBlock + "\n" + printBlock(`Apply IN filter to "${fieldName}"`)(
      iff(
        ifExpression,
        raw(`$util.error("${fieldName} attribute must be valid url", "InvalidArgumentsError")`),
        true
      )
    );
  };

  private createUrlVTLSnippet = (fieldName: string, fieldPattern: string): string => {
    return printBlock(`Check url validation "${fieldName}"`)(
      iff(
        raw(`"^(https?|ftp|file)://[-a-zA-Z0-9+&@#/%?=~_|!:,.;]*[-a-zA-Z0-9+&@#/%=~_|]", $ctx.args.input.${fieldName})`),
        raw(`$util.error("${fieldName} attribute must be valid url", "InvalidArgumentsError")`),
        true
      )
    );
  };

  private createEmailVTLSnippet = (fieldName: string, fieldPattern: string): string => {
    return printBlock(`Check email validation "${fieldName}"`)(
      iff(
        raw(`!$util.matches("^[_A-Za-z0-9-\\+]+(\\.[_A-Za-z0-9-]+)*@`
          + `[A-Za-z0-9-]+(\\.[A-Za-z0-9]+)*(\\.[A-Za-z]{2,})$", $ctx.args.input.${fieldName})`),
        raw(`$util.error("${fieldName} attribute must be valid email", "InvalidArgumentsError")`),
        true
      )
    );
  };

  private createRegexVTLSnippet = (fieldName: string, fieldPattern: string): string => {
    if (typeof fieldPattern === 'undefined') {
      throw new InvalidDirectiveError('expression attribute should be set to validate pattern.');
    }
    return printBlock(`Check regex validation "${fieldName}"`)(
      iff(
        raw(`!$util.matches("${fieldPattern}", $ctx.args.input.${fieldName})`),
        raw(`$util.error("${fieldName} attribute must match pattern", "InvalidArgumentsError")`),
        true
      )
    );
  };

  private createStringVTLSnippet = (fieldName: string): string => {
    return printBlock(`Check string validation "${fieldName}"`)(
      iff(
        raw(`!$util.isString($ctx.args.input.${fieldName})`),
        raw(`$util.error("${fieldName} attribute must be of type string", "InvalidArgumentsError")`),
        true
      )
    );
  };

  private createBooleanVTLSnippet = (fieldName: string): string => {
    return printBlock(`Check boolean validation "${fieldName}"`)(
      iff(
        raw(`!$util.isBoolean($ctx.args.input.${fieldName})`),
        raw(`$util.error("${fieldName} attribute must be of type boolean", "InvalidArgumentsError")`),
        true
      )
    );
  };

  private createNumberVTLSnippet = (fieldName: string): string => {
    return printBlock(`Check number validation "${fieldName}"`)(
      iff(
        raw(`!$util.isNumber($ctx.args.input.${fieldName})`),
        raw(`$util.error("${fieldName} attribute must be of type number", "InvalidArgumentsError")`),
        true
      )
    );
  };

  private createRequiredVTLSnippet = (fieldName: string): string => {
    return printBlock(`Check required validation "${fieldName}"`)(
      iff(
        raw(`!$ctx.args.input.${fieldName}`),
        raw(`$util.error("${fieldName} attribute is required", "InvalidArgumentsError")`),
        true
      )
    );
  };

  private createFilterVTLSnippet = (fieldName: string, fieldType: string, args: ValidatorDirective): string => {
    switch (args.filter) {
      case FilterName.default:
        return this.createDefaultVTLSnippet(fieldName, fieldType, args);
      case FilterName.lowercase:
        return this.createLowercaseVTLSnippet(fieldName);
      case FilterName.uppercase:
        return this.createUppercaseVTLSnippet(fieldName);
      case FilterName.lcFirst:
        return this.createLcFirstVTLSnippet(fieldName);
      case FilterName.ucFirst:
        return this.createUcFirstVTLSnippet(fieldName);
      case FilterName.trim:
        return this.createTrimVTLSnippet(fieldName);
      default:
        throw new InvalidDirectiveError('Invalid filter.');
    }
  };

  private createDefaultVTLSnippet = (fieldName: string, fieldType: string, args: ValidatorDirective): string => {
    let defaultValuePart: QuietReferenceNode;
    switch (fieldType) {
      case 'String':
        if (typeof args.valueString === 'undefined') {
          throw new InvalidDirectiveError('valueString must be defined.');
        }
        defaultValuePart = qref(`$ctx.args.input.put("${fieldName}", "${args.valueString}")`);
        break;
      case 'Int':
        if (typeof args.valueInteger === 'undefined') {
          throw new InvalidDirectiveError('valueInteger must be defined.');
        }
        defaultValuePart = qref(`$ctx.args.input.put("${fieldName}", ${args.valueInteger})`);
        break;
      case 'Float':
        if (typeof args.valueFloat === 'undefined') {
          throw new InvalidDirectiveError('valueFloat must be defined.');
        }
        defaultValuePart = qref(`$ctx.args.input.put("${fieldName}", ${args.valueFloat})`);
        break;
      case 'Boolean':
        if (typeof args.valueBoolean === 'undefined') {
          throw new InvalidDirectiveError('valueBoolean must be defined.');
        }
        defaultValuePart = qref(`$ctx.args.input.put("${fieldName}", ${args.valueBoolean})`);
        break;
      default:
        throw new InvalidDirectiveError('Unexpected field type.');
    }
    return printBlock(`Apply default filter to "${fieldName}"`)(
      ifElse(
        raw(`$ctx.args.input.${fieldName}`),
        qref(`$ctx.args.input.put("${fieldName}", $ctx.args.input.${fieldName})`),
        defaultValuePart,
        true
      )
    );
  };

  private createLcFirstVTLSnippet = (fieldName: string): string => {
    return printBlock(`Apply lower case first character filter to "${fieldName}"`)(
      iff(
        raw(`$ctx.args.input.${fieldName}`),
        qref(`$ctx.args.input.put("${fieldName}", "".concat($ctx.args.input.${fieldName}.charAt(0).toLowerCase(), $ctx.args.input.${fieldName}.slice(1)) )`),
        true
      )
    );
  };

  private createUcFirstVTLSnippet = (fieldName: string): string => {
    return printBlock(`Apply upper case first character filter to "${fieldName}"`)(
      iff(
        raw(`$ctx.args.input.${fieldName}`),
        qref(`$ctx.args.input.put("${fieldName}", "".concat($ctx.args.input.${fieldName}.charAt(0).toUpperCase(), $ctx.args.input.${fieldName}.slice(1)) )`),
        true
      )
    );
  };

  private createTrimVTLSnippet = (fieldName: string): string => {
    return printBlock(`Apply trim filter to "${fieldName}"`)(
      iff(
        raw(`$ctx.args.input.${fieldName}`),
        qref(`$ctx.args.input.put("${fieldName}", $ctx.args.input.${fieldName}.trim() )`),
        true
      )
    );
  };

  private createLowercaseVTLSnippet = (fieldName: string): string => {
    return printBlock(`Setting "${fieldName}" to lower case`)(
      iff(
        raw(`$ctx.args.input.${fieldName}`),
        qref(`$ctx.args.input.put("${fieldName}", $ctx.args.input.${fieldName}.toLowerCase() )`),
        true
      )
    );
  };

  private createUppercaseVTLSnippet = (fieldName: string): string => {
    return printBlock(`Setting "${fieldName}" to upper case`)(
      iff(
        raw(`$ctx.args.input.${fieldName}`),
        qref(`$ctx.args.input.put("${fieldName}", $ctx.args.input.${fieldName}.toUpperCase() )`),
        true
      )
    );
  };

  private parseArguments = (args: ReadonlyArray<ArgumentNode>): ValidatorDirective => {
    const res: ValidatorDirective = {type: null};
    args.forEach((item: ArgumentNode): void => {
      if (item.value.kind === 'ListValue') {
        // TODO item: StringValueNode can also be of different type depends on Array type
        res[item.name.value] = item.value.values.map((item: StringValueNode) => item.value);
      } else if (item.value.kind === 'StringValue'
        || item.value.kind === 'BooleanValue'
        || item.value.kind === 'FloatValue'
        || item.value.kind === 'IntValue'
        || item.value.kind === 'EnumValue'
      ) {
        res[item.name.value] = item.value.value;
      }
    });
    return res;
  };

  private assertModelDirective = (directives: readonly DirectiveNode[]): void => {
    const modelDirective = directives.find(dir => dir.name.value === 'model');
    if (!modelDirective) {
      throw new InvalidDirectiveError(
        'Fields annotated with @validator must have parent types annotated with @model.'
      );
    }
  };


  private augmentMutations = (ctx: TransformerContext, typeName: string, snippet: string): void => {
    const createMutationResolverLogicalId: string = ResolverResourceIDs.DynamoDBCreateResolverResourceID(
      typeName
    );
    const updateMutationResolverLogicalId = ResolverResourceIDs.DynamoDBUpdateResolverResourceID(
      typeName
    );
    this.augmentResolver(ctx, createMutationResolverLogicalId, snippet);
    this.augmentResolver(ctx, updateMutationResolverLogicalId, snippet);
  };

  private augmentResolver = (
    ctx: TransformerContext,
    resolverLogicalId: string,
    snippet: string
  ): void => {
    const resolver = ctx.getResource(resolverLogicalId);
    if (resolver) {
      resolver.Properties.RequestMappingTemplate =
        snippet + '\n\n' + resolver.Properties.RequestMappingTemplate;
      ctx.setResource(resolverLogicalId, resolver);
    }
  };
}
