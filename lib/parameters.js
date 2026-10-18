/** Compile the local parameter shorthand to the JSON Schema DSH exposes to models. */
export function compileParameters(properties) {
  const compiled = {};
  const required = [];
  for (const [name, spec] of Object.entries(properties)) {
    if (spec.required === true) required.push(name);
    const { required: _required, ...node } = spec;
    if (node.type === 'object') Object.assign(node, compileParameters(node.properties ?? {}));
    if (node.items) node.items = compileParameters({ item: node.items }).properties.item;
    if (node.oneOf) node.oneOf = node.oneOf.map(branch => compileParameters({ branch }).properties.branch);
    compiled[name] = node;
  }
  return { type: 'object', properties: compiled, ...(required.length ? { required } : {}) };
}

/** DSH raw registrations own argument validation; reject before starting the helper. */
export function assertArguments(schema, value, at = 'arguments') {
  const fail = detail => {
    throw Object.assign(new Error(at + ': ' + detail), { code: 'invalid_arguments' });
  };
  if (schema.oneOf) {
    let matches = 0;
    for (const branch of schema.oneOf) {
      try { assertArguments(branch, value, at); matches += 1; } catch (error) {
        if (error.code !== 'invalid_arguments') throw error;
      }
    }
    if (matches !== 1) fail('must match exactly one supported shape');
    return;
  }
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('must be an object');
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) fail('missing required field ' + key);
    }
    for (const [key, item] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (property) assertArguments(property, item, at + '.' + key);
      else if (schema.additionalProperties === false) fail('unknown field ' + key);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) fail('must be an array');
    if (schema.items) value.forEach((item, i) => assertArguments(schema.items, item, at + '[' + i + ']'));
  } else if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('must be a finite number');
  } else if (schema.type && typeof value !== schema.type) {
    fail('must be a ' + schema.type);
  }
  if (schema.enum && !schema.enum.includes(value)) fail('unsupported value');
}
