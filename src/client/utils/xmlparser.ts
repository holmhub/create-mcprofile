export interface XMLNode {
	name: string;
	value?: string;
	children?: { [key: string]: XMLNode[] };
}

export function parseXMLString(xmlString: string): XMLNode {
	const cleanXml = xmlString.replace(/>\s+</g, '><').trim();

	function parseNode(xml: string): XMLNode {
		const tagMatch = xml.match(/<(\w+)>([\s\S]*?)<\/\1>/);
		if (!tagMatch) {
			return { name: '', value: xml };
		}

		const [, tagName, content] = tagMatch;
		const node: XMLNode = { name: tagName || '' };

		// Check if content has child nodes
		const childMatches = content?.match(/<\w+>[\s\S]*?<\/\w+>/g);
		if (childMatches) {
			node.children = {};
			for (const childXml of childMatches) {
				const childNode = parseNode(childXml);
				if (!node.children[childNode.name]) {
					node.children[childNode.name] = [];
				}
				node.children[childNode.name]?.push(childNode);
			}
		} else {
			node.value = content?.trim();
		}

		return node;
	}

	return parseNode(cleanXml);
}
