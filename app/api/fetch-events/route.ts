import { NextRequest } from 'next/server';

interface GraphQLField {
  name: string;
}

interface IntrospectionResponse {
  data?: {
    __type?: {
      fields?: GraphQLField[];
    };
  };
}

export async function POST(req: NextRequest) {
  try {
    const { subgraphId, apiKey, query, skip = 0 }: {
      subgraphId: string;
      apiKey: string;
      query: string;
      skip?: number;
    } = await req.json();

    if (!subgraphId || !apiKey || !query) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400 }
      );
    }

    const url = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;

    // Extract top-level entities from the query
    const topLevelEntities = Array.from(query.matchAll(/^\s*(\w+)\s*{/gm))
      .map(([, entity]) => entity)
      .filter((e) => !['query', 'mutation', 'subscription'].includes(e));
      console.log('Top-level entities:', topLevelEntities);
    async function getOrderByField(entity: string): Promise<string> {
      const introspectionQuery = {
        query: `{
          __type(name: "${entity}") {
            fields { name }
          }
        }`,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(introspectionQuery),
      });
    
      const json: IntrospectionResponse = await res.json();
     console.log('introspection query response:',json)
      const fields = json.data?.__type?.fields?.map(f => f.name) || [];

      return fields.includes('timestamp') ? 'timestamp'
           : fields.includes('createdAt') ? 'createdAt'
           : fields.includes('proposalId') ? 'proposalId'
           : 'id';
    }

    const orderByMap: Record<string, string> = {};
    for (const entity of topLevelEntities) {
      orderByMap[entity] = await getOrderByField(entity);
      console.log(`Order by for ${entity}:`, orderByMap[entity]);
    }

    const modifiedQuery = query.replace(
      /^(\s*)(\w+)(\s*)({)/gm,
      (match, indent, field, space, brace) => {
        if (["query", "mutation", "subscription"].includes(field)) return match;
        const orderBy = orderByMap[field] || 'id';
        return `${indent}${field}(first: 1000, skip: ${skip}, orderBy: ${orderBy}, orderDirection: asc)${space}${brace}`;
      }
    );
    console.log('Modified GraphQL query:', modifiedQuery);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: modifiedQuery }),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), { status: 200 });
    
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Server error', message: err.message }),
      { status: 500 }
    );
  }
}
